import { supabase } from '@/shared/lib/supabase';
import type { PickExperience, PlanRevision, PlanState, RsvpStatus } from '@/types/database';

export type PlanRsvp = { user_id: string; name: string; isGuest: boolean; status: RsvpStatus; revision: number };
export type PlanExperience = PickExperience & { booking_url: string | null; duration_min: number | null };

export type PlanDetail = {
  plan: {
    id: string; group_id: string; organizer_id: string; experience_id: string; pick_id: string | null;
    state: PlanState; current_revision: number; cancel_reason: string | null;
  };
  groupName: string;
  organizerName: string;
  experience: PlanExperience;
  current: PlanRevision;
  /** the revision before this one (for the "old to new" banner), when there is one */
  previous: PlanRevision | null;
  rsvps: PlanRsvp[];
};

type PlanWithEmbeds = PlanDetail['plan'] & {
  groups: { name: string } | null;
  organizer: { display_name: string } | null;
  experiences: PlanExperience;
  plan_revisions: PlanRevision[];
};

const PLAN_COLUMNS = 'id, group_id, organizer_id, experience_id, pick_id, state, current_revision, cancel_reason';

/** One plan with everything the screen shows. null = this person is not invited (group membership grants no access). */
export async function fetchPlanDetail(planId: string): Promise<PlanDetail | null> {
  const [planRes, rsvpRes] = await Promise.all([
    supabase
      .from('plans')
      .select(
        `${PLAN_COLUMNS}, groups(name), organizer:profiles!organizer_id(display_name), ` +
          'experiences(id, name, category, area, price_kind, price_min, price_max, booking_required, timing_kind, meeting_point, booking_url, duration_min), ' +
          'plan_revisions(revision, start_at, end_at, time_zone, meeting_point, note, price_snapshot, booking_required)',
      )
      .eq('id', planId)
      .maybeSingle(),
    supabase.from('rsvps').select('user_id, status, revision, profiles(display_name, is_guest)').eq('plan_id', planId).is('removed_at', null),
  ]);
  if (planRes.error) throw planRes.error;
  if (rsvpRes.error) throw rsvpRes.error;
  if (!planRes.data) return null;

  const p = planRes.data as unknown as PlanWithEmbeds;
  const revisions = [...p.plan_revisions].sort((a, b) => a.revision - b.revision);
  const current = revisions.find((r) => r.revision === p.current_revision) ?? revisions[revisions.length - 1];
  const previous = revisions.filter((r) => r.revision < current.revision).pop() ?? null;
  const { groups, organizer, experiences, plan_revisions: _omit, ...plan } = p;

  type RsvpRow = { user_id: string; status: RsvpStatus; revision: number; profiles: { display_name: string; is_guest: boolean } | null };
  const rsvps = (rsvpRes.data as unknown as RsvpRow[]).map((r) => ({
    user_id: r.user_id, name: r.profiles?.display_name ?? 'Someone', isGuest: r.profiles?.is_guest ?? false, status: r.status, revision: r.revision,
  }));
  // organizer first, then everyone else by name
  rsvps.sort((a, b) => Number(b.user_id === plan.organizer_id) - Number(a.user_id === plan.organizer_id) || a.name.localeCompare(b.name));

  return {
    plan, groupName: groups?.name ?? 'Group', organizerName: organizer?.display_name ?? 'The organizer',
    experience: experiences, current, previous, rsvps,
  };
}

// ---------------------------------------------------------------- writes (RPC only)
export type SendPlanArgs = {
  clientKey: string; groupId: string; experienceId: string; startLocal: string; endLocal: string;
  meetingPoint: string; note: string | null; recipients: string[]; pickId: string | null;
};

/** Same clientKey returns the same plan, so a retry after a dropped connection never creates a second plan. */
export async function sendPlan(a: SendPlanArgs): Promise<string> {
  const { data, error } = await supabase.rpc('send_plan', {
    p_client_key: a.clientKey, p_group_id: a.groupId, p_experience_id: a.experienceId,
    p_start_local: a.startLocal, p_end_local: a.endLocal, p_meeting_point: a.meetingPoint, p_note: a.note,
    p_recipients: a.recipients, p_pick_id: a.pickId, p_time_zone: 'America/Chicago',
  });
  if (error) throw error;
  return data as string;
}

export type Counts = { going: number; awaiting: number; cant_go: number; needs_reconfirm: number; revision: number };

export async function respond(planId: string, revision: number, status: 'going' | 'cant_go'): Promise<Counts> {
  const { data, error } = await supabase.rpc('respond', { p_plan_id: planId, p_revision: revision, p_status: status });
  if (error) throw error;
  return data as Counts;
}

export type PlanChanges = { start_local?: string; end_local?: string; meeting_point?: string; note?: string };
export type EditResult = { material: boolean; changed: boolean; revision: number; needs_reconfirm: number };

export async function editPlan(planId: string, changes: PlanChanges): Promise<EditResult> {
  const { data, error } = await supabase.rpc('edit_plan', { p_plan_id: planId, p_changes: changes });
  if (error) throw error;
  return data as EditResult;
}
