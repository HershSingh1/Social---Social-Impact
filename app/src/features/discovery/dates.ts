// Date filter (P0-05). Days are Austin calendar days, "YYYY-MM-DD" (rule 4). Day arithmetic runs on calendar
// dates, never on instants plus 24 hours, so the DST weekends can't shift a day.
import { toChicagoLocal } from '../../lib/time';

export type DateFilter = 'any' | 'this-weekend' | 'next-weekend' | { day: string };

/** The columns the date filter reads. `sessions` is `[{ start_local, end_local }]` in Austin time (G6). */
export type Schedulable = {
  timing_kind: 'fixed' | 'flexible' | 'unknown';
  sessions?: unknown;
  hours_text: string | null;
};

/** Today's date in Austin, whatever the phone's zone. */
export function chicagoToday(now: Date = new Date()): string {
  return toChicagoLocal(now).slice(0, 10);
}

function toUtcDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function addDays(day: string, days: number): string {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(day: string): number {
  return toUtcDate(day).getUTCDay();
}

/**
 * The Austin days a date filter covers, from today on. A weekend is Saturday and Sunday. On a Saturday or Sunday,
 * "This weekend" is the one in progress (just Sunday on a Sunday) and "Next weekend" is the one after it.
 */
export function filterDays(filter: DateFilter, today: string): string[] | null {
  if (filter === 'any') return null;
  if (typeof filter === 'object') return [filter.day];
  const dow = weekday(today);
  const saturday = addDays(today, dow === 0 ? -1 : 6 - dow);
  if (filter === 'next-weekend') return [addDays(saturday, 7), addDays(saturday, 8)];
  return [saturday, addDays(saturday, 1)].filter(day => day >= today);
}

const DAY = String.raw`\b(sun|mon|tue|wed|thu|fri|sat)(?:day|s|sday|nesday|r|rs|rsday|urday)?s?\.?\b`;
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const dayIndex = (name: string) => DAY_NAMES.indexOf(name.toLowerCase());

function daysBetween(from: number, to: number): number[] {
  const days = [from];
  for (let day = from; day !== to;) days.push(day = (day + 1) % 7);
  return days;
}

/**
 * The weekdays a flexible experience is open, read from its free-text hours (G16): day names and ranges such as
 * "Mon-Thu" or "Tue to Sun", "daily", "weekdays", "weekends", minus "closed Monday". Text that names no day is
 * read as open every day ("10 a.m. to 6 p.m."). Empty hours mean we don't know, so no day.
 */
export function openWeekdays(hoursText: string | null): Set<number> {
  const text = hoursText?.trim().toLowerCase() ?? '';
  if (!text) return new Set();
  const closed = new Set<number>();
  const withoutClosed = text.replace(new RegExp(String.raw`closed(?:\s+on)?\s+${DAY}`, 'gi'), (_, name: string) => {
    closed.add(dayIndex(name));
    return ' ';
  });
  const open = new Set<number>();
  const rest = withoutClosed.replace(new RegExp(String.raw`${DAY}\s*(?:-|–|—|to|through|thru)\s*${DAY}`, 'gi'),
    (_, from: string, to: string) => {
      daysBetween(dayIndex(from), dayIndex(to)).forEach(day => open.add(day));
      return ' ';
    });
  for (const match of rest.matchAll(new RegExp(DAY, 'gi'))) open.add(dayIndex(match[1]));
  if (/\bweekdays\b/.test(rest)) [1, 2, 3, 4, 5].forEach(day => open.add(day));
  if (/\bweekends\b/.test(rest)) [0, 6].forEach(day => open.add(day));
  if (/\b(daily|every day|7 days)\b/.test(rest) || open.size === 0) [0, 1, 2, 3, 4, 5, 6].forEach(day => open.add(day));
  closed.forEach(day => open.delete(day));
  return open;
}

function sessionDays(sessions: unknown): string[] {
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap(session => {
    const start = (session as { start_local?: unknown } | null)?.start_local;
    return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start) ? [start.slice(0, 10)] : [];
  });
}

/**
 * Spec date rules: set sessions match if one starts on one of the days; flexible hours match if open on one of
 * them; unknown timing (and set sessions with none listed) never matches a date.
 */
export function matchesDate(experience: Schedulable, filter: DateFilter, today: string): boolean {
  const days = filterDays(filter, today);
  if (days === null) return true;
  if (experience.timing_kind === 'fixed') return sessionDays(experience.sessions).some(day => days.includes(day));
  if (experience.timing_kind === 'flexible') {
    const open = openWeekdays(experience.hours_text);
    return days.some(day => open.has(weekday(day)));
  }
  return false;
}

const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "This weekend", "Next weekend" or "Sat, Nov 14". */
export function dateFilterLabel(filter: DateFilter): string {
  if (filter === 'any') return 'Any';
  if (filter === 'this-weekend') return 'This weekend';
  if (filter === 'next-weekend') return 'Next weekend';
  return dayLabel.format(toUtcDate(filter.day));
}
