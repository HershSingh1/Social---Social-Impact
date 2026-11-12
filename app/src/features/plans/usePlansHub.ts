import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { loadSavedDrafts } from './drafts';
import { EMPTY_HUB_DATA, type HubPick, type HubPlan, type ViewerPlanStatus } from './hub';

export const plansHubQueryKey = ['plans-hub'] as const;

type RawRelation = { name: string } | { name: string }[] | null;
type RawPlan = {
  id: string; experience_name: string; state: string; current_revision: number;
  group: RawRelation;
  plan_revisions: { revision: number; start_at: string; end_at: string }[];
  rsvps: { user_id: string; status: string; removed_at: string | null }[];
};
type RawPick = {
  id: string; title: string; state: string; deadline: string; group: RawRelation;
  pick_voter_status: { user_id: string; complete: boolean }[];
};

const relationName = (relation: RawRelation) => (Array.isArray(relation) ? relation[0]?.name : relation?.name) ?? 'No group';

async function fetchPlansHub() {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = auth.user;
  if (!user) return EMPTY_HUB_DATA;

  const [plansResult, picksResult] = await Promise.all([
    supabase.from('plans').select(`
      id, experience_name, state, current_revision,
      group:groups(name),
      plan_revisions!plan_revisions_plan_id_fkey(revision, start_at, end_at),
      rsvps(user_id, status, removed_at)
    `).in('state', ['sent', 'cancelled']),
    supabase.from('picks').select(`
      id, title, state, deadline,
      group:groups(name),
      pick_voter_status(user_id, complete)
    `).eq('state', 'open'),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (picksResult.error) throw picksResult.error;

  const plans = (plansResult.data as unknown as RawPlan[]).map((row): HubPlan => {
    const revision = row.plan_revisions.find(item => item.revision === row.current_revision);
    if (!revision) throw new Error('A plan is missing its current revision.');
    const viewer = row.rsvps.find(item => item.user_id === user.id && item.removed_at === null);
    return {
      id: row.id,
      experienceName: row.experience_name,
      groupName: relationName(row.group),
      state: row.state as HubPlan['state'],
      startAt: revision.start_at,
      endAt: revision.end_at,
      viewerStatus: (viewer?.status as ViewerPlanStatus | undefined) ?? null,
    };
  });
  const picks = (picksResult.data as unknown as RawPick[]).map((row): HubPick => ({
    id: row.id,
    title: row.title,
    groupName: relationName(row.group),
    state: row.state as HubPick['state'],
    deadline: row.deadline,
    viewerComplete: row.pick_voter_status.find(item => item.user_id === user.id)?.complete ?? false,
  }));
  return { plans, picks };
}

export function usePlansHubQuery() {
  return useQuery({ queryKey: plansHubQueryKey, queryFn: fetchPlansHub });
}

export function usePlansHubRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: plansHubQueryKey }); };
    const channel = supabase.channel('plans-hub-live');
    for (const table of ['plans', 'plan_revisions', 'rsvps', 'picks', 'pick_voter_status']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);
}

export const savedDraftsKey = ['plan-drafts'] as const;
/** Drafts saved on this phone (C2). A failure here never hides the rest of the hub. */
export function useSavedDrafts() {
  return useQuery({ queryKey: savedDraftsKey, queryFn: loadSavedDrafts });
}
