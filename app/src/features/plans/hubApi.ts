import { supabase } from '@/shared/lib/supabase';
import type { RsvpStatus } from '@/types/database';
import type { HubPick, HubPlan } from './hub';

type PlanRow = {
  id: string; group_id: string; organizer_id: string; state: 'sent' | 'cancelled'; current_revision: number;
  groups: { name: string } | null; experiences: { name: string } | null;
  plan_revisions: { revision: number; start_at: string; end_at: string }[];
  rsvps: { user_id: string; status: RsvpStatus; removed_at: string | null }[];
};
type PickRowWithEmbeds = {
  id: string; group_id: string; state: 'open' | 'closed'; deadline: string;
  winner_option_id: string | null; override_option_id: string | null;
  groups: { name: string } | null; pick_options: { id: string; experiences: { name: string } | null }[];
};

/**
 * Everything the Plans tab, its badge, and the "next item" lines read. RLS means this is only the plans the person was
 * invited to and the picks of their own groups.
 */
export async function fetchHub(userId: string): Promise<{ plans: HubPlan[]; picks: HubPick[] }> {
  const [plansRes, picksRes, statusRes] = await Promise.all([
    supabase
      .from('plans')
      .select(
        'id, group_id, organizer_id, state, current_revision, groups(name), experiences(name), plan_revisions(revision, start_at, end_at), rsvps(user_id, status, removed_at)',
      )
      .in('state', ['sent', 'cancelled']),
    supabase
      .from('picks')
      .select('id, group_id, state, deadline, winner_option_id, override_option_id, groups(name), pick_options(id, experiences(name))')
      .in('state', ['open', 'closed']),
    supabase.from('pick_voter_status').select('pick_id, complete').eq('user_id', userId),
  ]);
  for (const r of [plansRes, picksRes, statusRes]) if (r.error) throw r.error;

  const plans: HubPlan[] = [];
  for (const p of plansRes.data as unknown as PlanRow[]) {
    const mine = p.rsvps.find((r) => r.user_id === userId && r.removed_at === null);
    const rev = p.plan_revisions.find((r) => r.revision === p.current_revision);
    if (!mine || !rev) continue;
    plans.push({
      id: p.id, groupId: p.group_id, groupName: p.groups?.name ?? 'Group', experienceName: p.experiences?.name ?? 'Plan',
      startAt: rev.start_at, endAt: rev.end_at, state: p.state, status: mine.status, isOrganizer: p.organizer_id === userId,
    });
  }

  const complete = new Map((statusRes.data ?? []).map((s) => [s.pick_id as string, s.complete as boolean]));
  const picks: HubPick[] = (picksRes.data as unknown as PickRowWithEmbeds[]).map((p) => {
    const chosen = p.pick_options.find((o) => o.id === (p.override_option_id ?? p.winner_option_id));
    return {
      id: p.id, groupId: p.group_id, groupName: p.groups?.name ?? 'Group', state: p.state, deadline: p.deadline,
      voted: complete.get(p.id) ?? false, optionCount: p.pick_options.length, winnerName: chosen?.experiences?.name ?? null,
    };
  });
  return { plans, picks };
}
