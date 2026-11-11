import { PRICE_UNKNOWN_LABEL } from './filters';
import type { Experience } from './useExperiences';

export const SEARCH_DELAY_MS = 300;
/** Downtown Austin, where the map starts and stays when location is off (T01). */
export const AUSTIN = { latitude: 30.2672, longitude: -97.7431, latitudeDelta: 0.12, longitudeDelta: 0.12 };

/** Case-insensitive match on name, area and category; every word typed has to appear somewhere. */
export function matchesSearch(experience: Pick<Experience, 'name' | 'area' | 'category'>, text: string): boolean {
  const haystack = `${experience.name} ${experience.area ?? ''} ${experience.category}`.toLowerCase();
  return text.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}

export function priceLabel(e: Pick<Experience, 'price_kind' | 'price_min' | 'price_max'>): string {
  if (e.price_kind === 'free') return 'Free';
  if (e.price_kind === 'unknown' || e.price_min === null) return PRICE_UNKNOWN_LABEL;
  const range = e.price_max !== null && e.price_max !== e.price_min ? `$${e.price_min}–$${e.price_max}` : `$${e.price_min}`;
  return e.price_kind === 'estimated' ? `About ${range}` : range;
}

export function timingLabel(e: Pick<Experience, 'timing_kind' | 'hours_text'>): string {
  if (e.timing_kind === 'fixed') return 'Set session times';
  if (e.timing_kind === 'unknown') return 'Timing not confirmed';
  return e.hours_text ?? 'Hours unverified';
}
