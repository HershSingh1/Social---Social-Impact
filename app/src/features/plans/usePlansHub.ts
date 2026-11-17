import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { loadSavedDrafts } from './drafts';
import { EMPTY_HUB_DATA, type HubPick, type HubPlan, type ViewerPlanStatus } from './hub';

export const plansHubQueryKey = ['plans-hub'] as const;
const HUB_FALLBACK_REFETCH_MS = 30_000;

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

type HubData = { plans: HubPlan[]; picks: HubPick[] };
type RealtimeTarget = { table: 'plans' | 'plan_revisions' | 'rsvps' | 'picks' | 'pick_voter_status'; filter: string };

/** Only rows that can add or change an item in this viewer's hub. */
export function plansHubRealtimeTargets(userId: string, planIds: string[], pickIds: string[]): RealtimeTarget[] {
  const targets: RealtimeTarget[] = [
    { table: 'rsvps', filter: `user_id=eq.${userId}` },
    { table: 'pick_voter_status', filter: `user_id=eq.${userId}` },
    { table: 'plans', filter: `organizer_id=eq.${userId}` },
    { table: 'picks', filter: `organizer_id=eq.${userId}` },
  ];
  for (const id of new Set(planIds)) {
    targets.push({ table: 'plans', filter: `id=eq.${id}` });
    targets.push({ table: 'plan_revisions', filter: `plan_id=eq.${id}` });
  }
  for (const id of new Set(pickIds)) targets.push({ table: 'picks', filter: `id=eq.${id}` });
  return targets;
}

export function usePlansHubRealtime(userId: string | undefined, data: HubData | undefined) {
  const queryClient = useQueryClient();
  const planIds = (data?.plans ?? []).map(plan => plan.id).sort().join(',');
  const pickIds = (data?.picks ?? []).map(pick => pick.id).sort().join(',');
  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: plansHubQueryKey }); };
    const channel = supabase.channel('plans-hub-live');
    for (const target of plansHubRealtimeTargets(userId, planIds ? planIds.split(',') : [], pickIds ? pickIds.split(',') : [])) {
      channel.on('postgres_changes', { event: '*', schema: 'public', ...target }, refresh);
    }
    channel.subscribe();
    const fallback = setInterval(refresh, HUB_FALLBACK_REFETCH_MS);
    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [pickIds, planIds, queryClient, userId]);
}

export const savedDraftsKey = ['plan-drafts'] as const;
/** Drafts saved on this phone (C2). A failure here never hides the rest of the hub. */
export function useSavedDrafts() {
  return useQuery({ queryKey: savedDraftsKey, queryFn: loadSavedDrafts });
}
