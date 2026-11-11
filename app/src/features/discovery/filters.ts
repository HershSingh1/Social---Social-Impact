// Activity and Price filters (P0-05). Pure functions only: the Map and List read the same state and call
// `applyFilters`, so both always show the same experiences. No React, no network.

export const ACTIVITY_CATEGORIES = [
  'Art and walks', 'Make something', 'Outdoors', 'Food and drink', 'Games and trivia', 'Music and film', 'Active',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
/** One category, or `all` for no activity filter. */
export type ActivityFilter = ActivityCategory | 'all';

// `cap` is the highest known price (USD) that still matches. Free is a cap of 0. `null` means no cap.
export const PRICE_FILTERS = [
  { id: 'any', label: 'Any', cap: null },
  { id: 'free', label: 'Free', cap: 0 },
  { id: 'under25', label: 'Under $25', cap: 25 },
  { id: 'under50', label: 'Under $50', cap: 50 },
] as const;
export type PriceFilterId = (typeof PRICE_FILTERS)[number]['id'];

export type Filters = { activity: ActivityFilter; price: PriceFilterId };
export const DEFAULT_FILTERS: Filters = { activity: 'all', price: 'any' };

/** The columns the filters read. Catalog rows (price_kind, price_min, price_max, category) fit this. */
export type Filterable = {
  category: string;
  price_kind: 'exact' | 'estimated' | 'free' | 'unknown';
  price_min: number | null;
  price_max: number | null;
};

export const PRICE_UNKNOWN_LABEL = 'Price unknown';

/** The most this experience costs per person, or null when we don't know. Estimated prices use the top of their range. */
export function knownMaxPrice(experience: Filterable): number | null {
  if (experience.price_kind === 'free') return 0;
  if (experience.price_kind === 'unknown') return null;
  // An exact or estimated row with no number is treated as unknown rather than guessed.
  return experience.price_max ?? experience.price_min ?? null;
}

/** Rows to label "Price unknown" on the Map and List. */
export function isPriceUnknown(experience: Filterable): boolean {
  return knownMaxPrice(experience) === null;
}

/**
 * Whether a price filter lets this experience through. Unknown prices stay visible (the spec's "Include unknown
 * prices" toggle, on by default). TEC-84 adds the toggle and passes `false` here to hide them.
 */
export function matchesPrice(experience: Filterable, price: PriceFilterId, includeUnknown = true): boolean {
  const cap = PRICE_FILTERS.find(option => option.id === price)?.cap ?? null;
  if (cap === null) return true;
  const max = knownMaxPrice(experience);
  return max === null ? includeUnknown : max <= cap;
}

export function matchesActivity(experience: Filterable, activity: ActivityFilter): boolean {
  return activity === 'all' || experience.category === activity;
}

export function applyFilters<T extends Filterable>(experiences: readonly T[], filters: Filters, includeUnknown = true): T[] {
  return experiences.filter(item => matchesActivity(item, filters.activity) && matchesPrice(item, filters.price, includeUnknown));
}

export function countActiveFilters(filters: Filters): number {
  return Number(filters.activity !== DEFAULT_FILTERS.activity) + Number(filters.price !== DEFAULT_FILTERS.price);
}

export function priceFilterLabel(price: PriceFilterId): string {
  return PRICE_FILTERS.find(option => option.id === price)?.label ?? 'Any';
}
