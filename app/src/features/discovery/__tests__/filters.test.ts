import { expect, test } from '@jest/globals';
import {
  ACTIVITY_CATEGORIES, DEFAULT_FILTERS, PRICE_FILTERS, applyFilters, countActiveFilters, isPriceUnknown, matchesPrice,
  type Filterable, type Filters, type PriceFilterId,
} from '../filters';

const make = (price_kind: Filterable['price_kind'], price_min: number | null, price_max: number | null, category = 'Outdoors') =>
  ({ category, price_kind, price_min, price_max, timing_kind: 'flexible' as const, hours_text: 'Daily 9 a.m.-5 p.m.' });
const only = (filters: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...filters });

// Every price kind, with the prices that sit just under, on and over each cap.
const cases: { name: string; item: ReturnType<typeof make>; matches: Record<PriceFilterId, boolean> }[] = [
  { name: 'free', item: make('free', 0, 0), matches: { any: true, free: true, under25: true, under50: true } },
  { name: 'free with no numbers', item: make('free', null, null), matches: { any: true, free: true, under25: true, under50: true } },
  { name: 'exact $0.01', item: make('exact', 0.01, 0.01), matches: { any: true, free: false, under25: true, under50: true } },
  { name: 'exact $24.99', item: make('exact', 24.99, 24.99), matches: { any: true, free: false, under25: true, under50: true } },
  { name: 'exact $25 (cap is inclusive)', item: make('exact', 25, 25), matches: { any: true, free: false, under25: true, under50: true } },
  { name: 'exact $25.01', item: make('exact', 25.01, 25.01), matches: { any: true, free: false, under25: false, under50: true } },
  { name: 'exact $50', item: make('exact', 50, 50), matches: { any: true, free: false, under25: false, under50: true } },
  { name: 'exact $50.01', item: make('exact', 50.01, 50.01), matches: { any: true, free: false, under25: false, under50: false } },
  { name: 'estimated $5 to $9', item: make('estimated', 5, 9), matches: { any: true, free: false, under25: true, under50: true } },
  { name: 'estimated $12 to $40 uses the top of the range', item: make('estimated', 12, 40), matches: { any: true, free: false, under25: false, under50: true } },
  { name: 'estimated $20 to $25', item: make('estimated', 20, 25), matches: { any: true, free: false, under25: true, under50: true } },
  { name: 'estimated $75 to $95', item: make('estimated', 75, 95), matches: { any: true, free: false, under25: false, under50: false } },
  { name: 'estimated $0 to $10', item: make('estimated', 0, 10), matches: { any: true, free: false, under25: true, under50: true } },
  // Unknown prices stay visible (the toggle's default is on), for every cap.
  { name: 'unknown', item: make('unknown', null, null), matches: { any: true, free: true, under25: true, under50: true } },
  { name: 'estimated with no numbers counts as unknown', item: make('estimated', null, null), matches: { any: true, free: true, under25: true, under50: true } },
];

test.each(cases)('price filters against $name', ({ item, matches }) => {
  for (const option of PRICE_FILTERS) expect([option.id, matchesPrice(item, option.id)]).toEqual([option.id, matches[option.id]]);
});

test('unknown prices are hidden by every cap when the include-unknown toggle is off, but "Any" still shows them', () => {
  const unknown = make('unknown', null, null);
  expect(matchesPrice(unknown, 'any', false)).toBe(true);
  for (const id of ['free', 'under25', 'under50'] as const) expect(matchesPrice(unknown, id, false)).toBe(false);
  expect(matchesPrice(make('exact', 10, 10), 'under25', false)).toBe(true);
});

test('only unknown prices are labelled "Price unknown"', () => {
  expect(isPriceUnknown(make('unknown', null, null))).toBe(true);
  expect(isPriceUnknown(make('estimated', null, null))).toBe(true);
  expect(isPriceUnknown(make('free', 0, 0))).toBe(false);
  expect(isPriceUnknown(make('exact', 38, 38))).toBe(false);
  expect(isPriceUnknown(make('estimated', 5, 9))).toBe(false);
});

test('the activity filter keeps one category, or everything for All', () => {
  const rows = ACTIVITY_CATEGORIES.map(category => make('free', 0, 0, category));
  expect(applyFilters(rows, DEFAULT_FILTERS)).toHaveLength(7);
  for (const category of ACTIVITY_CATEGORIES) {
    expect(applyFilters(rows, only({ activity: category })).map(row => row.category)).toEqual([category]);
  }
});

test('activity and price combine, and filtering does not change the input', () => {
  const rows = [make('free', 0, 0, 'Outdoors'), make('exact', 60, 60, 'Outdoors'), make('free', 0, 0, 'Active'), make('unknown', null, null, 'Outdoors')];
  const result = applyFilters(rows, only({ activity: 'Outdoors', price: 'under25' }));
  expect(result).toEqual([rows[0], rows[3]]);
  expect(rows).toHaveLength(4);
  expect(applyFilters(rows, only({ activity: 'Outdoors', price: 'under25', includeUnknownPrices: false }))).toEqual([rows[0]]);
});

test('counts the filters that are on', () => {
  expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  expect(countActiveFilters(only({ activity: 'Active' }))).toBe(1);
  expect(countActiveFilters(only({ activity: 'Active', price: 'free' }))).toBe(2);
  expect(countActiveFilters(only({ activity: 'Active', price: 'free', date: 'this-weekend', includeUnknownPrices: false }))).toBe(4);
});

test('the include-unknown toggle defaults to on', () => {
  expect(DEFAULT_FILTERS.includeUnknownPrices).toBe(true);
});

test('Under $25 with unknown prices off hides every unknown price; on brings them back (spec Done when)', () => {
  const rows = [make('unknown', null, null), make('estimated', null, null), make('exact', 20, 20), make('exact', 30, 30)];
  expect(applyFilters(rows, only({ price: 'under25', includeUnknownPrices: false }))).toEqual([rows[2]]);
  expect(applyFilters(rows, only({ price: 'under25' }))).toEqual([rows[0], rows[1], rows[2]]);
  // With no price cap the toggle hides nothing.
  expect(applyFilters(rows, only({ includeUnknownPrices: false }))).toEqual(rows);
});
