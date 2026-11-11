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
