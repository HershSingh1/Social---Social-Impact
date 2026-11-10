import type { Experience } from '@/types/database';
import { categoryLabel } from './categories';

export type PriceFilter = 'any' | 'free' | 'u25' | 'u50';
export type Filters = {
  category: Experience['category'] | null;
  price: PriceFilter;
  /** "Include unknown prices" (spec default: on). The toggle itself ships in the pilot; the rule is applied now. */
  includeUnknown: boolean;
};

export const DEFAULT_FILTERS: Filters = { category: null, price: 'any', includeUnknown: true };

export const PRICE_OPTIONS: { id: PriceFilter; label: string; cap: number | null }[] = [
  { id: 'any', label: 'Any price', cap: null },
  { id: 'free', label: 'Free', cap: 0 },
  { id: 'u25', label: 'Under $25', cap: 25 },
  { id: 'u50', label: 'Under $50', cap: 50 },
];

export const priceFilterLabel = (p: PriceFilter) => PRICE_OPTIONS.find((o) => o.id === p)?.label ?? 'Any price';

export const hasActiveFilters = (f: Filters, query = '') =>
  f.category !== null || f.price !== 'any' || !f.includeUnknown || query.trim() !== '';

/**
 * Price rules (P0-05): an experience matches a cap if its KNOWN maximum price is at or under the cap
 * (estimated prices use the top of their range). Unknown prices do not match a cap unless "Include unknown
 * prices" is on. With no cap, unknown prices show unless the toggle is off.
 */
export function matchesPrice(e: Experience, price: PriceFilter, includeUnknown: boolean): boolean {
  if (e.price_kind === 'unknown' || e.price_max === null) return includeUnknown;
  const cap = PRICE_OPTIONS.find((o) => o.id === price)?.cap ?? null;
  return cap === null || e.price_max <= cap;
}

/** Search matches experience name, area and category (spec P0-04). */
export function matchesQuery(e: Experience, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [e.name, e.area, categoryLabel(e.category)].some((field) => field.toLowerCase().includes(q));
}

export function filterExperiences(all: Experience[], filters: Filters, query: string): Experience[] {
  return all.filter(
    (e) =>
      (filters.category === null || e.category === filters.category) &&
      matchesPrice(e, filters.price, filters.includeUnknown) &&
      matchesQuery(e, query),
  );
}
