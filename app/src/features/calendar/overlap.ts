// P1-02 Free or Busy from the phone's calendar (TEC-145, decisions N1, N3 and F8). The only question asked of the calendar is
// "is there an event at this time?". An event is reduced to its times and two flags the moment it is read; its title,
// people, place and notes are never kept, logged or sent (rule 8).
export type BusyEvent = { start: number; end: number; /** The calendar's own "Free" setting on the event, as for a holiday. */ free: boolean; canceled: boolean };

/**
 * True when some event overlaps [start, end). Touching is not overlapping: an event that ends when the time starts, or
 * starts when it ends, leaves you free. Cancelled events and events marked Free don't count; all-day events do, like any other
 * (the person can leave a calendar like Birthdays out). A zero-length event counts when it falls inside the time.
 */
export function isBusy(events: readonly BusyEvent[], start: number, end: number): boolean {
  return events.some(e => {
    if (e.canceled || e.free) return false;
    return e.end > e.start ? e.start < end && e.end > start : e.start >= start && e.start < end;
  });
}

export type ProposedTime = { optionId: string; startAt: string; /** Minutes; a pick's time has no end, so a plan's usual length is assumed. */ durationMin?: number };
export const DEFAULT_DURATION_MIN = 120;
export type CalendarAnswer = { optionId: string; status: 'free' | 'busy' };

/** One Free or Busy per proposed time. A time without a valid start is skipped, never guessed. */
export function answersFor(times: readonly ProposedTime[], events: readonly BusyEvent[]): CalendarAnswer[] {
  return times.flatMap(t => {
    const start = Date.parse(t.startAt);
    if (Number.isNaN(start)) return [];
    const end = start + (t.durationMin ?? DEFAULT_DURATION_MIN) * 60_000;
    return [{ optionId: t.optionId, status: isBusy(events, start, end) ? 'busy' as const : 'free' as const }];
  });
}
