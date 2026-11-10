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

// ------------------------------------------------------------------ Chicago wall-clock helpers
// People pick times as wall-clock time in Austin. The server stores UTC plus the zone and refuses local times that
// do not exist on a daylight-saving change day; these helpers mirror that so the form can say so before sending.

export type Wall = { y: number; m: number; d: number; h: number; mi: number };

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
});

/** The Chicago wall-clock fields of an instant. */
export function chicagoWall(date: Date): Wall {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Chicago wall-clock time -> instant. Returns null when that local time does not exist (the spring-forward gap):
 * it is rejected, never shifted. For an ambiguous time (fall back) the earlier instant is used.
 */
export function chicagoWallToDate(w: Wall): Date | null {
  const naive = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  for (const offsetHours of [5, 6]) { // CDT = UTC-5, CST = UTC-6
    const candidate = new Date(naive + offsetHours * 3_600_000);
    const back = chicagoWall(candidate);
    if (back.y === w.y && back.m === w.m && back.d === w.d && back.h === w.h && back.mi === w.mi) return candidate;
  }
  return null;
}

/** "YYYY-MM-DDTHH:MM:SS": the wall-clock text the server functions take (send_plan, edit_plan). */
export function wallToLocalString(w: Wall): string {
  return `${w.y}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:00`;
}

export const wallToYmd = (w: Wall) => `${w.y}-${pad(w.m)}-${pad(w.d)}`;
export const wallToHm = (w: Wall) => `${pad(w.h)}:${pad(w.mi)}`;

export function parseYmdHm(ymd: string, hm: string): Wall {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return { y, m, d, h, mi };
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, ...opts });
const dayFmt = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
const whenFmt = fmt({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Sat, Nov 14" */
export const formatDay = (iso: string | Date) => dayFmt.format(new Date(iso));
/** "2:00 PM" */
export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));
/** "Sat, Nov 14, 2:00 PM" */
export const formatWhen = (iso: string | Date) => whenFmt.format(new Date(iso)).replace(' at ', ', ');

/** "2:00 to 3:30 PM" (the AM/PM is shown once when both ends share it). */
export function formatTimeRange(startIso: string, endIso: string): string {
  const a = formatTime(startIso);
  const b = formatTime(endIso);
  const [aT, aP] = a.split(' ');
  const [, bP] = b.split(' ');
  return aP === bP ? `${aT} to ${b}` : `${a} to ${b}`;
}

/** Choices for a date picker: today and the next `count - 1` days, in Chicago time. */
export function dayOptions(from: Date, count: number): { value: string; label: string }[] {
  const start = chicagoWall(from);
  return Array.from({ length: count }, (_, i) => {
    const noon = new Date(Date.UTC(start.y, start.m - 1, start.d + i, 12));
    const w = { y: noon.getUTCFullYear(), m: noon.getUTCMonth() + 1, d: noon.getUTCDate(), h: 12, mi: 0 };
    return { value: wallToYmd(w), label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(noon) };
  });
}

/** Choices for a time picker: every 30 minutes from 6:00 AM to 11:30 PM. */
export function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = 6; h < 24; h++) {
    for (const mi of [0, 30]) {
      const h12 = h % 12 === 0 ? 12 : h % 12;
      out.push({ value: `${pad(h)}:${pad(mi)}`, label: `${h12}:${pad(mi)} ${h < 12 ? 'AM' : 'PM'}` });
    }
  }
  return out;
}

/** Whole minutes between two instants, at least 0. */
export const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

/** "5h 12m left", "42m left", "Closed". */
export function timeLeft(deadlineIso: string, now: Date = new Date()): string {
  const ms = new Date(deadlineIso).getTime() - now.getTime();
  if (ms <= 0) return 'Closed';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${pad(m)}m left`;
  return `${Math.max(m, 1)}m left`;
}

/** The weekday and day number of an instant in Austin time, for the date block on list rows ("Sat", "14"). */
export function dayParts(iso: string | Date): { dow: string; day: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return { dow: p.weekday, day: p.day };
}
