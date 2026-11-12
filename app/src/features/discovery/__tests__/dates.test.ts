import { describe, expect, test } from '@jest/globals';
import { addDays, chicagoToday, dateFilterLabel, filterDays, matchesDate, openWeekdays, type Schedulable } from '../dates';
import { DEFAULT_FILTERS, applyFilters } from '../filters';

const fixed = (...starts: string[]): Schedulable =>
  ({ timing_kind: 'fixed', sessions: starts.map(start_local => ({ start_local, end_local: start_local })), hours_text: null });
const flexible = (hours_text: string | null): Schedulable => ({ timing_kind: 'flexible', sessions: null, hours_text });
const unknown: Schedulable = { timing_kind: 'unknown', sessions: null, hours_text: null };

const WED = '2026-11-11';

describe('the days each date option covers', () => {
  test('from a weekday, this weekend is the coming Saturday and Sunday, next weekend the one after', () => {
    expect(filterDays('this-weekend', WED)).toEqual(['2026-11-14', '2026-11-15']);
    expect(filterDays('next-weekend', WED)).toEqual(['2026-11-21', '2026-11-22']);
    expect(filterDays('this-weekend', '2026-11-13')).toEqual(['2026-11-14', '2026-11-15']);
  });

  test('on Saturday this weekend is today and tomorrow; on Sunday it is just today', () => {
    expect(filterDays('this-weekend', '2026-11-14')).toEqual(['2026-11-14', '2026-11-15']);
    expect(filterDays('next-weekend', '2026-11-14')).toEqual(['2026-11-21', '2026-11-22']);
    expect(filterDays('this-weekend', '2026-11-15')).toEqual(['2026-11-15']);
    expect(filterDays('next-weekend', '2026-11-15')).toEqual(['2026-11-21', '2026-11-22']);
  });

  test('a picked day is that day; Any covers everything', () => {
    expect(filterDays({ day: '2026-11-17' }, WED)).toEqual(['2026-11-17']);
    expect(filterDays('any', WED)).toBeNull();
  });

  test('weekends cross month and year ends', () => {
    expect(filterDays('next-weekend', '2026-12-30')).toEqual(['2027-01-09', '2027-01-10']);
    expect(filterDays('this-weekend', '2026-12-30')).toEqual(['2027-01-02', '2027-01-03']);
  });
});

describe('today is the Austin date, not the phone or UTC date', () => {
  test('11:30 PM Friday in Austin is already Saturday in UTC, but still Friday here', () => {
    expect(chicagoToday(new Date('2026-11-07T05:30:00Z'))).toBe('2026-11-06');
    expect(filterDays('this-weekend', chicagoToday(new Date('2026-11-07T05:30:00Z')))).toEqual(['2026-11-07', '2026-11-08']);
  });

  test('DST ends on Sunday Nov 1, 2026: the weekend is still Saturday and Sunday through the repeated hour', () => {
    // Sat Oct 31, 11:30 PM CDT.
    expect(chicagoToday(new Date('2026-11-01T04:30:00Z'))).toBe('2026-10-31');
    expect(filterDays('this-weekend', '2026-10-31')).toEqual(['2026-10-31', '2026-11-01']);
    // 1:30 AM on Nov 1 happens twice (CDT, then CST); both are Sunday.
    expect(chicagoToday(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
    expect(chicagoToday(new Date('2026-11-01T07:30:00Z'))).toBe('2026-11-01');
    // 11:30 PM CST Sunday is Monday in UTC.
    expect(chicagoToday(new Date('2026-11-02T05:30:00Z'))).toBe('2026-11-01');
    const session = fixed('2026-11-01T01:30');
    expect(matchesDate(session, 'this-weekend', '2026-10-31')).toBe(true);
    expect(matchesDate(session, 'this-weekend', '2026-11-01')).toBe(true);
    expect(matchesDate(session, 'next-weekend', '2026-10-31')).toBe(false);
  });

  test('DST starts on Sunday Mar 8, 2026: the short day is still one day', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(filterDays('this-weekend', '2026-03-04')).toEqual(['2026-03-07', '2026-03-08']);
    expect(matchesDate(fixed('2026-03-08T03:00'), 'this-weekend', '2026-03-04')).toBe(true);
    expect(matchesDate(flexible('Sundays 10 a.m.-2 p.m.'), 'this-weekend', '2026-03-04')).toBe(true);
  });
});

describe('set sessions match when one falls on the date', () => {
  test('a session on the day matches, one on another day does not', () => {
    expect(matchesDate(fixed('2026-11-14T10:00'), 'this-weekend', WED)).toBe(true);
    expect(matchesDate(fixed('2026-11-12T19:00', '2026-11-22T19:00'), 'this-weekend', WED)).toBe(false);
    expect(matchesDate(fixed('2026-11-12T19:00', '2026-11-22T19:00'), 'next-weekend', WED)).toBe(true);
    expect(matchesDate(fixed('2026-11-17T20:00'), { day: '2026-11-17' }, WED)).toBe(true);
    expect(matchesDate(fixed('2026-11-17T20:00'), { day: '2026-11-18' }, WED)).toBe(false);
  });

  test('set sessions with none listed, or malformed entries, never match a date', () => {
    expect(matchesDate({ timing_kind: 'fixed', sessions: null, hours_text: 'Tuesdays at 8 p.m.' }, { day: '2026-11-17' }, WED)).toBe(false);
    expect(matchesDate(fixed(), 'this-weekend', WED)).toBe(false);
    expect(matchesDate({ timing_kind: 'fixed', sessions: [null, { start_local: 14 }, {}], hours_text: null }, 'this-weekend', WED)).toBe(false);
  });
});

describe('flexible hours match when open that day', () => {
  test('ranges, including ones that wrap past Sunday', () => {
    const tueToSun = flexible('Reported Tue-Sun from 11 a.m. until sold out');
    expect(matchesDate(tueToSun, { day: '2026-11-16' }, WED)).toBe(false); // Monday
    expect(matchesDate(tueToSun, { day: '2026-11-17' }, WED)).toBe(true);
    expect([...openWeekdays('Fri to Sun, noon-10 p.m.')].sort()).toEqual([0, 5, 6]);
    expect([...openWeekdays('Tuesday through Saturday')].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  test('the seed catalog wording reads the way a person would', () => {
    expect([...openWeekdays('Reported Wed-Sun, 10 a.m.-6 p.m.; older listings say sunrise to sunset')].sort()).toEqual([0, 3, 4, 5, 6]);
    expect(openWeekdays('Reported Mon-Thu 11 a.m.-11 p.m., Fri 11 a.m.-midnight, Sat 10 a.m.-midnight, Sun 10 a.m.-8 p.m.').size).toBe(7);
    expect([...openWeekdays('Reported dance hall acts start 8:15-9 p.m., Tue-Sat')].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  test('single days, weekdays, weekends, daily and "closed"', () => {
    expect([...openWeekdays('Thursdays, 7 p.m.')]).toEqual([4]);
    expect([...openWeekdays('Weekends 9 a.m.-1 p.m.')].sort()).toEqual([0, 6]);
    expect([...openWeekdays('Weekdays 8-5')].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...openWeekdays('Open daily, closed Monday')].sort()).toEqual([0, 2, 3, 4, 5, 6]);
  });

  test('hours that name no day count as every day; missing hours match no date', () => {
    expect(openWeekdays('10 a.m. to 6 p.m.').size).toBe(7);
    expect(openWeekdays('Sunrise to sunset').size).toBe(7);
    expect(matchesDate(flexible('10 a.m. to 6 p.m.'), 'next-weekend', WED)).toBe(true);
    expect(matchesDate(flexible(null), 'this-weekend', WED)).toBe(false);
    expect(matchesDate(flexible('  '), 'this-weekend', WED)).toBe(false);
  });
});

test('unknown timing never matches a date, but shows with Any', () => {
  for (const filter of ['this-weekend', 'next-weekend', { day: '2026-11-17' }] as const) expect(matchesDate(unknown, filter, WED)).toBe(false);
  expect(matchesDate(unknown, 'any', WED)).toBe(true);
});

test('the date filter combines with the others in applyFilters', () => {
  const row = (name: string, timing: Schedulable) =>
    ({ name, category: 'Outdoors', price_kind: 'free' as const, price_min: 0, price_max: 0, ...timing });
  const rows = [row('weekend session', fixed('2026-11-14T10:00')), row('weekday hours', flexible('Mon-Fri 9-5')), row('unknown', unknown)];
  expect(applyFilters(rows, DEFAULT_FILTERS, WED)).toHaveLength(3);
  expect(applyFilters(rows, { ...DEFAULT_FILTERS, date: 'this-weekend' }, WED).map(r => r.name)).toEqual(['weekend session']);
  expect(applyFilters(rows, { ...DEFAULT_FILTERS, date: { day: '2026-11-16' } }, WED).map(r => r.name)).toEqual(['weekday hours']);
});

test('labels say the option in words', () => {
  expect(dateFilterLabel('this-weekend')).toBe('This weekend');
  expect(dateFilterLabel('next-weekend')).toBe('Next weekend');
  expect(dateFilterLabel({ day: '2026-11-14' })).toBe('Sat, Nov 14');
});
