import type { Experience } from '@/types/database';
import { DEFAULT_FILTERS, filterExperiences, hasActiveFilters, matchesPrice, matchesQuery } from './filters';

const base: Experience = {
  id: 'x', name: 'Test', category: 'outdoors', description: 'd', lat: 30.27, lng: -97.74, area: 'Zilker',
  price_kind: 'free', price_min: 0, price_max: 0, timing_kind: 'flexible', sessions: null, hours_text: 'Daily',
  duration_min: 60, meeting_point: 'Gate', booking_required: false, booking_url: null, source: 'PLACEHOLDER: t',
  checked_on: '2026-11-01', status: 'active', version: 1,
};
const e = (o: Partial<Experience>): Experience => ({ ...base, ...o });
const exact = (n: number) => e({ price_kind: 'exact', price_min: n, price_max: n });
const est = (lo: number, hi: number) => e({ price_kind: 'estimated', price_min: lo, price_max: hi });
const unknown = e({ price_kind: 'unknown', price_min: null, price_max: null });

describe('price rules (P0-05)', () => {
  it('matches when the known maximum is at or under the cap', () => {
    expect(matchesPrice(exact(25), 'u25', true)).toBe(true); // at the cap
    expect(matchesPrice(exact(25.01), 'u25', true)).toBe(false);
    expect(matchesPrice(exact(38), 'u25', true)).toBe(false);
    expect(matchesPrice(exact(38), 'u50', true)).toBe(true);
    expect(matchesPrice(e({}), 'free', true)).toBe(true);
    expect(matchesPrice(exact(1), 'free', true)).toBe(false);
  });
  it('estimated prices use the top of their range', () => {
    expect(matchesPrice(est(12, 20), 'u25', true)).toBe(true);
    expect(matchesPrice(est(20, 30), 'u25', true)).toBe(false); // top is 30
    expect(matchesPrice(est(30, 45), 'u50', true)).toBe(true);
  });
  it('unknown prices match only when "include unknown" is on', () => {
    expect(matchesPrice(unknown, 'u25', false)).toBe(false);
    expect(matchesPrice(unknown, 'u25', true)).toBe(true);
    expect(matchesPrice(unknown, 'free', false)).toBe(false);
    expect(matchesPrice(unknown, 'any', true)).toBe(true);
    expect(matchesPrice(unknown, 'any', false)).toBe(false);
  });
  it('with no cap every known price matches', () => {
    expect(matchesPrice(exact(500), 'any', true)).toBe(true);
  });
});

describe('search (P0-04)', () => {
  const x = e({ name: 'Sketch and stroll', area: 'Shoal Creek', category: 'art_walks' });
  it('matches name, area and category label, case-insensitively', () => {
    expect(matchesQuery(x, 'sketch')).toBe(true);
    expect(matchesQuery(x, 'SHOAL')).toBe(true);
    expect(matchesQuery(x, 'art and')).toBe(true);
    expect(matchesQuery(x, '  ')).toBe(true);
    expect(matchesQuery(x, 'kayak')).toBe(false);
  });
});

describe('filterExperiences', () => {
  const list: Experience[] = [
    e({ id: '1', name: 'Free walk', category: 'art_walks' }),
    exactWith('2', 'Clay', 'make', 38),
    exactWith('3', 'Climb', 'active', 28),
    { ...unknown, id: '4', name: 'Mystery trivia', category: 'games_trivia' },
  ];
  function exactWith(id: string, name: string, category: Experience['category'], n: number) {
    return e({ id, name, category, price_kind: 'exact', price_min: n, price_max: n });
  }
  const ids = (r: Experience[]) => r.map((x) => x.id);

  it('Under $25 with unknown prices off hides every unknown-price experience; on brings them back', () => {
    expect(ids(filterExperiences(list, { ...DEFAULT_FILTERS, price: 'u25', includeUnknown: false }, ''))).toEqual(['1']);
    expect(ids(filterExperiences(list, { ...DEFAULT_FILTERS, price: 'u25', includeUnknown: true }, ''))).toEqual(['1', '4']);
  });
  it('Under $50 includes the $38 and $28 rows', () => {
    expect(ids(filterExperiences(list, { ...DEFAULT_FILTERS, price: 'u50' }, ''))).toEqual(['1', '2', '3', '4']);
  });
  it('combines activity, price and search', () => {
    expect(ids(filterExperiences(list, { ...DEFAULT_FILTERS, category: 'make' }, ''))).toEqual(['2']);
    expect(ids(filterExperiences(list, { ...DEFAULT_FILTERS, price: 'u50' }, 'cl'))).toEqual(['2', '3']);
    expect(filterExperiences(list, { ...DEFAULT_FILTERS, category: 'make', price: 'free' }, '')).toEqual([]);
  });
  it('reports whether any filter is active', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, price: 'free' })).toBe(true);
    expect(hasActiveFilters(DEFAULT_FILTERS, 'sk')).toBe(true);
  });
});
