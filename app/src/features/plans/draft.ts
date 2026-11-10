import {
  chicagoWall, chicagoWallToDate, minutesBetween, parseYmdHm, timeOptions, wallToHm, wallToLocalString, wallToYmd,
} from '@/shared/lib/time';

/** A plan being prepared on this phone. It is only sent (send_plan) when the organizer taps "Send invitation". */
export type PlanDraft = {
  /** pickId for a plan made from a pick, otherwise `${groupId}:${experienceId}` */
  key: string;
  /** Request id for send_plan, made once when the draft is created and reused by every Retry (never duplicates). */
  clientKey: string;
  groupId: string;
  experienceId: string;
  pickId: string | null;
  date: string | null;  // 'YYYY-MM-DD' in Austin time
  start: string | null; // 'HH:MM'
  end: string | null;
  endTouched: boolean;
  meetingPoint: string;
  note: string;
  /** invited user ids (the organizer is always invited and always Going) */
  recipients: string[];
};

const TIMES = timeOptions().map((t) => t.value);
const LAST_SLOT = TIMES[TIMES.length - 1];

/** End time = start + duration, clamped to the last slot of the day (23:30). */
export function defaultEnd(start: string, durationMin: number | null): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + (durationMin && durationMin > 0 ? durationMin : 60);
  const rounded = Math.ceil(total / 30) * 30;
  if (rounded >= 24 * 60) return LAST_SLOT;
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

/** Split an instant into the draft's Austin-time date and time fields. */
export function fieldsFromInstant(iso: string): { date: string; start: string } {
  const w = chicagoWall(new Date(iso));
  return { date: wallToYmd(w), start: wallToHm(w) };
}

export type DraftErrors = { start?: string; end?: string; meetingPoint?: string; note?: string; general?: string };
export type DraftCheck = { errors: DraftErrors; startAt: Date | null; endAt: Date | null; ok: boolean };

export const NONEXISTENT = "That time doesn't exist on that day (clocks move forward). Pick another time.";

/**
 * The rules of P0-11, each with its own message under the field: start in the future, end after start, meeting point
 * 1-200 characters, note up to 500, and no fixed-session experiences yet (pilot).
 */
export function validateDraft(d: PlanDraft, experience: { timing_kind: 'fixed' | 'flexible' | 'unknown' }, now: Date = new Date()): DraftCheck {
  const errors: DraftErrors = {};
  let startAt: Date | null = null;
  let endAt: Date | null = null;

  if (!d.date || !d.start) {
    errors.start = 'Choose a date and start time.';
  } else {
    startAt = chicagoWallToDate(parseYmdHm(d.date, d.start));
    if (!startAt) errors.start = NONEXISTENT;
    else if (startAt.getTime() <= now.getTime()) errors.start = 'Start time must be in the future.';
  }
  if (!d.date || !d.end) {
    errors.end = 'Choose an end time.';
  } else {
    endAt = chicagoWallToDate(parseYmdHm(d.date, d.end));
    if (!endAt) errors.end = NONEXISTENT;
    else if (startAt && endAt.getTime() <= startAt.getTime()) errors.end = 'End time must be after the start time.';
  }

  const meet = d.meetingPoint.trim();
  if (meet.length < 1 || meet.length > 200) errors.meetingPoint = 'Add a meeting point (1 to 200 characters).';
  if (d.note.trim().length > 500) errors.note = 'Keep the note to 500 characters.';
  if (experience.timing_kind === 'fixed') {
    errors.general = 'This experience runs on fixed sessions. Plans for fixed-session experiences arrive in the next release.';
  }
  return { errors, startAt, endAt, ok: Object.keys(errors).length === 0 };
}

/** Arguments for send_plan. Times go as wall-clock text; the server converts and re-checks them. */
export function buildSendArgs(d: PlanDraft) {
  const date = d.date as string;
  return {
    clientKey: d.clientKey,
    groupId: d.groupId,
    experienceId: d.experienceId,
    startLocal: wallToLocalString(parseYmdHm(date, d.start as string)),
    endLocal: wallToLocalString(parseYmdHm(date, d.end as string)),
    meetingPoint: d.meetingPoint.trim(),
    note: d.note.trim() === '' ? null : d.note.trim(),
    recipients: d.recipients,
    pickId: d.pickId,
  };
}

/** Duration in minutes between two draft times on the same day. */
export function draftDuration(d: Pick<PlanDraft, 'date' | 'start' | 'end'>): number | null {
  if (!d.date || !d.start || !d.end) return null;
  const a = chicagoWallToDate(parseYmdHm(d.date, d.start));
  const b = chicagoWallToDate(parseYmdHm(d.date, d.end));
  return a && b ? minutesBetween(a, b) : null;
}

export type DraftAction =
  | { type: 'patch'; patch: Partial<Omit<PlanDraft, 'key' | 'clientKey'>> }
  | { type: 'setStart'; date: string; start: string; durationMin: number | null }
  | { type: 'setEnd'; end: string }
  | { type: 'toggleRecipient'; userId: string };

/** Moving the start keeps the length of the outing unless the end was set by hand. */
export function draftReducer(d: PlanDraft, a: DraftAction): PlanDraft {
  switch (a.type) {
    case 'patch':
      return { ...d, ...a.patch };
    case 'setStart': {
      const keep = d.endTouched ? draftDuration(d) : null;
      const end = d.endTouched && d.end ? (keep ? defaultEnd(a.start, keep) : d.end) : defaultEnd(a.start, a.durationMin);
      return { ...d, date: a.date, start: a.start, end };
    }
    case 'setEnd':
      return { ...d, end: a.end, endTouched: true };
    case 'toggleRecipient':
      return {
        ...d,
        recipients: d.recipients.includes(a.userId) ? d.recipients.filter((x) => x !== a.userId) : [...d.recipients, a.userId],
      };
  }
}
