/** All times show in the experience's zone, America/Chicago (spec: Rules for every screen). */
export const TIME_ZONE = 'America/Chicago';

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric' }).format(new Date(iso));
}
