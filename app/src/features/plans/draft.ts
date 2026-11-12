import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { logEvent } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';
import { fromChicagoLocal, toChicagoLocal } from '../../lib/time';

import { MEETING_POINT_MAX, NOTE_MAX } from './limits';

export { MEETING_POINT_MAX, NOTE_MAX };

/** Where a draft came from: Plan this on a closed pick, or Start a plan on Detail. */
export type DraftSource = { groupId: string; experienceId: string; pickId?: string };

export type PlanDraft = DraftSource & {
  /** Created once, with the draft, and reused by every Send and Retry (rule 3, P0-12). */
  clientKey: string;
  start: string; // ISO instant
  end: string;
  meetingPoint: string;
  note: string;
  /** Other members invited; the organizer is always added by the server. */
  recipients: string[];
  /** Ticked "I understand the price/booking is unconfirmed". Sent as `acknowledged`; not part of the key's payload. */
  acknowledged?: boolean;
};

export type DraftField = 'start' | 'end' | 'meetingPoint' | 'note' | 'recipients' | 'acknowledged' | 'form';
export type DraftErrors = Partial<Record<DraftField, string>>;

// Drafts live on the phone until Phase 1b adds server drafts (spec-decision C2).
export const DRAFT_KEY_PREFIX = 'sidequest.planDraft:';
const storageKey = ({ groupId, experienceId, pickId }: DraftSource) => `${DRAFT_KEY_PREFIX}${groupId}:${experienceId}:${pickId ?? '-'}`;

export async function loadDraft(source: DraftSource): Promise<PlanDraft | null> {
  const raw = await AsyncStorage.getItem(storageKey(source));
  return raw ? JSON.parse(raw) as PlanDraft : null;
}
export const saveDraft = (draft: PlanDraft) => AsyncStorage.setItem(storageKey(draft), JSON.stringify(draft));
export const discardDraft = (source: DraftSource) => AsyncStorage.removeItem(storageKey(source));

export function newDraft(source: DraftSource, defaults: { start: Date; durationMin: number; meetingPoint: string; recipients: string[] }): PlanDraft {
  return {
    ...source, clientKey: randomUUID(),
    start: defaults.start.toISOString(),
    end: new Date(defaults.start.getTime() + defaults.durationMin * 60_000).toISOString(),
    meetingPoint: defaults.meetingPoint.slice(0, MEETING_POINT_MAX), note: '', recipients: defaults.recipients,
  };
}

/** The checks the server repeats (`send_plan`), shown under each field before anything is sent. */
export function validateDraft(draft: PlanDraft, now = Date.now()): DraftErrors {
  const errors: DraftErrors = {};
  const start = new Date(draft.start).getTime();
  if (fromChicagoLocal(toChicagoLocal(new Date(draft.start))) === null) errors.start = 'That time doesn’t exist on this date (clocks skip ahead). Pick another time.';
  else if (start <= now) errors.start = 'Pick a start time in the future.';
  if (new Date(draft.end).getTime() <= start) errors.end = 'The end has to be after the start.';
  const point = draft.meetingPoint.trim();
  if (!point) errors.meetingPoint = 'Enter where to meet.';
  else if (Array.from(point).length > MEETING_POINT_MAX) errors.meetingPoint = `Use ${MEETING_POINT_MAX} characters or fewer.`;
  if (Array.from(draft.note.trim()).length > NOTE_MAX) errors.note = `Use ${NOTE_MAX} characters or fewer.`;
  return errors;
}

/** Server refusals, placed under the field they belong to. Anything else is a connection problem: keep the draft, offer Retry. */
const SERVER_ERRORS: Record<string, [DraftField, string]> = {
  invalid_times: ['start', 'Pick a start time in the future, and an end after it.'],
  nonexistent_local_time: ['start', 'That time doesn’t exist on this date (clocks skip ahead). Pick another time.'],
  invalid_meeting_point: ['meetingPoint', `Enter where to meet, up to ${MEETING_POINT_MAX} characters.`],
  invalid_note: ['note', `Use ${NOTE_MAX} characters or fewer.`],
  recipient_not_a_member: ['recipients', 'Someone you picked has left the group. Check the list and send again.'],
  unconfirmed_info_not_acknowledged: ['acknowledged', 'This listing’s price or booking isn’t confirmed. Tick the box to send anyway.'],
  pick_already_planned: ['form', 'This vote already has a plan.'],
  client_key_conflict: ['form', 'This plan was already sent. Check the Plans tab.'],
};

export class SendRefused extends Error {
  constructor(public readonly field: DraftField, message: string) { super(message); }
}

export async function sendPlan(draft: PlanDraft): Promise<string> {
  const { data, error } = await supabase.rpc('send_plan', {
    client_key: draft.clientKey, group_id: draft.groupId, experience_id: draft.experienceId,
    start_local: toChicagoLocal(new Date(draft.start)), end_local: toChicagoLocal(new Date(draft.end)),
    meeting_point: draft.meetingPoint.trim(), note: draft.note.trim() || null, recipients: draft.recipients,
    pick_id: draft.pickId ?? null, time_zone: 'America/Chicago', acknowledged: draft.acknowledged === true,
  });
  if (error) {
    const known = Object.keys(SERVER_ERRORS).find(code => error.message.includes(code));
    if (known) throw new SendRefused(...SERVER_ERRORS[known]);
    throw error;
  }
  logEvent('plan_sent', { plan_id: data as string, group_id: draft.groupId });
  return data as string;
}

export type PlanContext = {
  experience: { name: string; meetingPoint: string | null; hoursText: string | null; durationMin: number | null;
    timingKind: string; priceLabel: string;
    /** null: the listing doesn't say whether booking is needed (G15). */
    bookingRequired: boolean | null;
    /** What Send needs acknowledged; empty when price and booking are both known. */
    unconfirmed: ('price' | 'booking')[];
    /** Upcoming listed sessions, as hints. Any time can still be sent (G6). */
    sessions: string[] };
  members: { userId: string; name: string }[];
};

function priceLabel(kind: string, min: number | null, max: number | null): string {
  if (kind === 'free') return 'Free';
  if (kind === 'unknown' || min === null) return 'Price not confirmed';
  const range = max !== null && max !== min ? `$${min}–$${max}` : `$${min}`;
  return kind === 'estimated' ? `About ${range} per person` : `${range} per person`;
}

type ListedSession = { start_local?: unknown; end_local?: unknown };
const sessionDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const sessionClock = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
const wall = (local: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
};

/** "Sat, Nov 14, 10:00 AM–12:00 PM" for each listed session that hasn't started. The strings are Austin
 * wall-clock times already, so they are formatted as-is, never shifted by the phone's zone. */
export function listedSessions(raw: unknown, now = new Date()): string[] {
  const today = toChicagoLocal(now);
  return (Array.isArray(raw) ? raw as ListedSession[] : []).flatMap(s => {
    if (typeof s?.start_local !== 'string' || s.start_local.replace(' ', 'T') <= today) return [];
    const start = wall(s.start_local);
    const end = typeof s.end_local === 'string' ? wall(s.end_local) : null;
    if (!start) return [];
    return [`${sessionDay.format(start)}, ${sessionClock.format(start)}${end ? `–${sessionClock.format(end)}` : ''}`];
  });
}

/** "I understand the price is unconfirmed", "…booking is…" or "…price and booking are…". */
export function acknowledgeLabel(unconfirmed: PlanContext['experience']['unconfirmed']): string {
  if (unconfirmed.length > 1) return 'I understand the price and booking are unconfirmed';
  return `I understand the ${unconfirmed[0]} is unconfirmed`;
}

/** The experience and group members a draft needs. Reads only; RLS decides. */
export async function fetchPlanContext(groupId: string, experienceId: string, me: string): Promise<PlanContext> {
  const [ex, members] = await Promise.all([
    supabase.from('experiences').select('name, meeting_point, address, hours_text, duration_min, timing_kind, price_kind, price_min, price_max, booking_required, sessions')
      .eq('id', experienceId).maybeSingle(),
    supabase.from('group_members').select('user_id').eq('group_id', groupId).is('removed_at', null).eq('blocked', false).order('joined_at'),
  ]);
  if (ex.error) throw ex.error;
  if (members.error) throw members.error;
  if (!ex.data) throw new Error('experience_not_found');
  const e = ex.data as Record<string, unknown>;
  const others = ((members.data ?? []) as { user_id: string }[]).map(m => m.user_id).filter(id => id !== me);
  const cards = others.length ? await supabase.rpc('get_profile_cards', { user_ids: others }) : { data: [], error: null };
  if (cards.error) throw cards.error;
  const nameOf = new Map(((cards.data ?? []) as { user_id: string; display_name: string }[]).map(c => [c.user_id, c.display_name]));
  return {
    experience: {
      name: String(e.name), meetingPoint: (e.meeting_point ?? e.address ?? null) as string | null,
      hoursText: (e.hours_text ?? null) as string | null, durationMin: (e.duration_min ?? null) as number | null,
      timingKind: String(e.timing_kind), bookingRequired: (e.booking_required ?? null) as boolean | null,
      unconfirmed: [...(e.price_kind === 'unknown' ? ['price' as const] : []), ...(e.booking_required == null ? ['booking' as const] : [])],
      sessions: listedSessions(e.sessions),
      priceLabel: priceLabel(String(e.price_kind), e.price_min as number | null, e.price_max as number | null),
    },
    members: others.map(userId => ({ userId, name: nameOf.get(userId) ?? 'Member' })),
  };
}
