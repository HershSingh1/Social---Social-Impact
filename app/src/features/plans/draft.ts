import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase } from '../../lib/supabase';
import { fromChicagoLocal, toChicagoLocal } from '../../lib/time';

export const MEETING_POINT_MAX = 200;
export const NOTE_MAX = 500;

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
};

export type DraftField = 'start' | 'end' | 'meetingPoint' | 'note' | 'recipients' | 'form';
export type DraftErrors = Partial<Record<DraftField, string>>;

// Drafts live on the phone until Phase 1b adds server drafts (spec-decision C2).
const storageKey = ({ groupId, experienceId, pickId }: DraftSource) => `sidequest.planDraft:${groupId}:${experienceId}:${pickId ?? '-'}`;

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
  fixed_sessions_not_supported: ['start', 'This activity runs at set times. Picking a session comes in a later update.'],
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
    pick_id: draft.pickId ?? null, time_zone: 'America/Chicago',
  });
  if (error) {
    const known = Object.keys(SERVER_ERRORS).find(code => error.message.includes(code));
    if (known) throw new SendRefused(...SERVER_ERRORS[known]);
    throw error;
  }
  return data as string;
}

export type PlanContext = {
  experience: { name: string; meetingPoint: string | null; hoursText: string | null; durationMin: number | null;
    timingKind: string; priceLabel: string; bookingRequired: boolean };
  members: { userId: string; name: string }[];
};

function priceLabel(kind: string, min: number | null, max: number | null): string {
  if (kind === 'free') return 'Free';
  if (kind === 'unknown' || min === null) return 'Price not confirmed';
  const range = max !== null && max !== min ? `$${min}–$${max}` : `$${min}`;
  return kind === 'estimated' ? `About ${range} per person` : `${range} per person`;
}

/** The experience and group members a draft needs. Reads only; RLS decides. */
export async function fetchPlanContext(groupId: string, experienceId: string, me: string): Promise<PlanContext> {
  const [ex, members] = await Promise.all([
    supabase.from('experiences').select('name, meeting_point, address, hours_text, duration_min, timing_kind, price_kind, price_min, price_max, booking_required')
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
      timingKind: String(e.timing_kind), bookingRequired: Boolean(e.booking_required),
      priceLabel: priceLabel(String(e.price_kind), e.price_min as number | null, e.price_max as number | null),
    },
    members: others.map(userId => ({ userId, name: nameOf.get(userId) ?? 'Member' })),
  };
}
