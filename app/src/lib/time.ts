// Times are stored in UTC and always shown in the plan's zone, America/Chicago (rule 4).
export const PLAN_TIME_ZONE = 'America/Chicago';

const dayTime = new Intl.DateTimeFormat('en-US', {
  timeZone: PLAN_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

/** "Fri, Nov 14 · 8:00 PM" in Austin time. */
export function formatWhen(iso: string): string {
  const parts = Object.fromEntries(dayTime.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${parts.weekday}, ${parts.month} ${parts.day} · ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

/** "closes in 5 h", "closes in 20 min" or "closing now", for a pick deadline. */
export function closesIn(iso: string, now = Date.now()): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0) return 'closing now';
  if (minutes < 60) return `closes in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `closes in ${hours} h` : `closes ${formatWhen(iso)}`;
}

const wallClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLAN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** The Austin wall-clock time of an instant, as "YYYY-MM-DDTHH:MM" (the format `send_plan` and `edit_plan` take). */
export function toChicagoLocal(date: Date): string {
  const p = Object.fromEntries(wallClock.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The instant an Austin wall-clock time names, or null when that time doesn't exist (2:30 AM on the
 * spring-forward Sunday). In the repeated fall-back hour the earlier instant wins. */
export function fromChicagoLocal(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Central time is UTC-6 (CST) or UTC-5 (CDT).
  const matches = [5, 6].map(h => new Date(naive + h * 3_600_000)).filter(d => toChicagoLocal(d) === local);
  return matches.length ? matches.reduce((a, b) => (a < b ? a : b)) : null;
}

const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: PLAN_TIME_ZONE, timeZoneName: 'short' });
/** "Austin time (CST)" or "Austin time (CDT)", named on Review and Plan (rule 4). */
export function zoneLabel(date: Date): string {
  const abbr = zoneName.formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? 'CT';
  return `Austin time (${abbr})`;
}

/** "10:00 AM", in Austin time. */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: PLAN_TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
