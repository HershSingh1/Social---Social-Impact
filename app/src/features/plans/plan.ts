import { supabase } from '../../lib/supabase';

export type RsvpStatus = 'going' | 'awaiting' | 'cant_go' | 'needs_reconfirm';
export type Invitee = { userId: string; name: string; status: RsvpStatus; isOrganizer: boolean;
  /** The revision this person last answered; older than current while they need to reconfirm. */
  answeredRevision: number };
export type Revision = { revision: number; startAt: string; endAt: string; meetingPoint: string; note: string | null;
  price: { kind: string; min: number | null; max: number | null }; bookingRequired: boolean };
export type Plan = {
  id: string; name: string; organizerId: string; state: 'sent' | 'cancelled' | 'draft'; cancelReason: string | null;
  /** For "Start a new plan from it". The experience is null once its listing is removed. */
  groupId: string | null; experienceId: string | null;
  current: Revision; revisions: Revision[]; invitees: Invitee[];
};
export type Counts = Record<RsvpStatus, number>;

/** Status in words, never color alone (rule 7). */
export const statusLabel: Record<RsvpStatus, string> = {
  going: 'Going', awaiting: 'Awaiting reply', cant_go: 'Can’t go', needs_reconfirm: 'Needs reconfirmation',
};

/** Every invitee is in exactly one bucket, so the four always add up to the invitee count (P0-13). */
export function countRsvps(invitees: Pick<Invitee, 'status'>[]): Counts {
  const counts: Counts = { going: 0, awaiting: 0, cant_go: 0, needs_reconfirm: 0 };
  for (const i of invitees) counts[i.status] += 1;
  return counts;
}

export function priceText({ kind, min, max }: Revision['price']): string {
  if (kind === 'free') return 'Free';
  if (kind === 'unknown' || min === null) return 'Price not confirmed';
  const range = max !== null && max !== min ? `$${min}–$${max}` : `$${min}`;
  return kind === 'estimated' ? `About ${range} per person` : `${range} per person`;
}

type RevisionRow = { revision: number; start_at: string; end_at: string; meeting_point: string; note: string | null;
  price_snapshot: { kind: string; min: number | null; max: number | null }; booking_required: boolean };
const toRevision = (r: RevisionRow): Revision => ({
  revision: r.revision, startAt: r.start_at, endAt: r.end_at, meetingPoint: r.meeting_point, note: r.note,
  price: r.price_snapshot, bookingRequired: r.booking_required,
});

export class PlanUnavailable extends Error { constructor() { super('plan_unavailable'); } }

/** Reads only; RLS returns nothing for a plan the viewer isn't invited to. */
export async function fetchPlan(planId: string): Promise<Plan> {
  const plan = await supabase.from('plans').select('id, experience_name, organizer_id, state, cancel_reason, current_revision, group_id, experience_id')
    .eq('id', planId).maybeSingle();
  if (plan.error) throw plan.error;
  if (!plan.data) throw new PlanUnavailable();
  const p = plan.data as { id: string; experience_name: string; organizer_id: string; state: Plan['state']; cancel_reason: string | null; current_revision: number;
    group_id: string | null; experience_id: string | null };
  const [revisions, rsvps] = await Promise.all([
    supabase.from('plan_revisions').select('revision, start_at, end_at, meeting_point, note, price_snapshot, booking_required')
      .eq('plan_id', planId),
    supabase.from('rsvps').select('user_id, status, revision').eq('plan_id', planId).is('removed_at', null),
  ]);
  if (revisions.error) throw revisions.error;
  if (rsvps.error) throw rsvps.error;
  const revs = (revisions.data ?? []) as RevisionRow[];
  const current = revs.find(r => r.revision === p.current_revision);
  if (!current) throw new Error('missing_revision');
  const rows = (rsvps.data ?? []) as { user_id: string; status: RsvpStatus; revision: number }[];
  const cards = await supabase.rpc('get_profile_cards', { user_ids: rows.map(r => r.user_id) });
  if (cards.error) throw cards.error;
  const nameOf = new Map(((cards.data ?? []) as { user_id: string; display_name: string }[]).map(c => [c.user_id, c.display_name]));
  return {
    id: p.id, name: p.experience_name, organizerId: p.organizer_id, state: p.state, cancelReason: p.cancel_reason, groupId: p.group_id, experienceId: p.experience_id,
    current: toRevision(current), revisions: revs.map(toRevision),
    invitees: rows.map(r => ({ userId: r.user_id, name: nameOf.get(r.user_id) ?? 'Member', status: r.status, isOrganizer: r.user_id === p.organizer_id, answeredRevision: r.revision }))
      // Organizer first, then by name.
      .sort((a, b) => Number(b.isOrganizer) - Number(a.isOrganizer) || a.name.localeCompare(b.name)),
  };
}

export const RESPOND_ERRORS: Record<string, string> = {
  stale_revision: 'This plan just changed. Check the new details and answer again.',
  answers_locked: 'This plan has started, so answers are closed.',
  plan_cancelled: 'This plan was cancelled.',
  not_invited: 'This plan isn’t available to you.',
};

export class RespondRefused extends Error {
  constructor(public readonly code: string) { super(RESPOND_ERRORS[code]); }
}

/** Answers against the revision the person is looking at; the server refuses a stale one. */
export async function respond(planId: string, revision: number, status: 'going' | 'cant_go') {
  const { error } = await supabase.rpc('respond', { plan_id: planId, revision, status });
  if (!error) return;
  const known = Object.keys(RESPOND_ERRORS).find(code => error.message.includes(code));
  throw known ? new RespondRefused(known) : error;
}

export const planKey = (planId: string) => ['plan', planId] as const;
