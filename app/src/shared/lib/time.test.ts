import {
  chicagoWall, chicagoWallToDate, dayOptions, formatTimeRange, formatWhen, minutesBetween, parseYmdHm, timeLeft, timeOptions,
  wallToHm, wallToLocalString, wallToYmd,
} from './time';

describe('Chicago wall clock <-> instant', () => {
  it('converts CST (winter) and CDT (summer)', () => {
    expect(chicagoWallToDate({ y: 2026, m: 11, d: 14, h: 14, mi: 0 })?.toISOString()).toBe('2026-11-14T20:00:00.000Z'); // UTC-6
    expect(chicagoWallToDate({ y: 2027, m: 6, d: 1, h: 14, mi: 0 })?.toISOString()).toBe('2027-06-01T19:00:00.000Z'); // UTC-5
  });
  it('rejects a local time that does not exist on the spring-forward day instead of shifting it', () => {
    expect(chicagoWallToDate({ y: 2027, m: 3, d: 14, h: 2, mi: 30 })).toBeNull();
    expect(chicagoWallToDate({ y: 2027, m: 3, d: 14, h: 3, mi: 0 })).not.toBeNull();
    expect(chicagoWallToDate({ y: 2027, m: 3, d: 14, h: 1, mi: 30 })).not.toBeNull();
  });
  it('accepts an ambiguous fall-back time (uses the first occurrence)', () => {
    expect(chicagoWallToDate({ y: 2026, m: 11, d: 1, h: 1, mi: 30 })?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
  it('round-trips through the wall-clock fields', () => {
    const d = new Date('2026-11-14T20:00:00Z');
    expect(chicagoWall(d)).toEqual({ y: 2026, m: 11, d: 14, h: 14, mi: 0 });
  });
});

describe('formatting', () => {
  it('formats in Austin time', () => {
    expect(formatWhen('2026-11-14T20:00:00Z')).toBe('Sat, Nov 14, 2:00 PM');
    expect(formatTimeRange('2026-11-14T20:00:00Z', '2026-11-14T21:30:00Z')).toBe('2:00 to 3:30 PM');
    expect(formatTimeRange('2026-11-14T16:30:00Z', '2026-11-14T20:00:00Z')).toBe('10:30 AM to 2:00 PM');
  });
  it('builds the wall-clock text the server takes', () => {
    const w = parseYmdHm('2026-11-14', '14:00');
    expect(wallToLocalString(w)).toBe('2026-11-14T14:00:00');
    expect(wallToYmd(w)).toBe('2026-11-14');
    expect(wallToHm(w)).toBe('14:00');
  });
});

describe('picker options and countdown', () => {
  it('lists days starting today in Chicago time', () => {
    const opts = dayOptions(new Date('2026-11-14T03:00:00Z'), 3); // still Nov 13 in Austin
    expect(opts.map((o) => o.value)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
    expect(opts[1].label).toBe('Sat, Nov 14');
  });
  it('lists half-hour times from 6 AM to 11:30 PM', () => {
    const t = timeOptions();
    expect(t[0]).toEqual({ value: '06:00', label: '6:00 AM' });
    expect(t[12]).toEqual({ value: '12:00', label: '12:00 PM' });
    expect(t[t.length - 1]).toEqual({ value: '23:30', label: '11:30 PM' });
  });
  it('counts down', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(timeLeft('2026-11-14T17:12:00Z', now)).toBe('5h 12m left');
    expect(timeLeft('2026-11-14T12:42:00Z', now)).toBe('42m left');
    expect(timeLeft('2026-11-16T14:00:00Z', now)).toBe('2d 2h left');
    expect(timeLeft('2026-11-14T11:59:00Z', now)).toBe('Closed');
    expect(minutesBetween(new Date('2026-11-14T20:00:00Z'), new Date('2026-11-14T21:30:00Z'))).toBe(90);
  });
});
