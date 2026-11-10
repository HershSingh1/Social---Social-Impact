/** All times show in the experience's zone, America/Chicago (spec: Rules for every screen). */
export const TIME_ZONE = 'America/Chicago';

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** A date-only value ("2026-11-01") as "Nov 1, 2026", without any time-zone shift. */
export function formatDateOnly(ymd: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
    .format(new Date(`${ymd}T00:00:00Z`));
}
