import type { Experience } from '@/types/database';

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Long price label for Detail (spec P0-06): exact, estimated, free, unknown. Currency is always USD. */
export function priceLabel(e: Pick<Experience, 'price_kind' | 'price_min' | 'price_max'>): string {
  switch (e.price_kind) {
    case 'free':
      return 'Free';
    case 'exact':
      return `${money(e.price_max ?? 0)} per person`;
    case 'estimated': {
      const lo = e.price_min ?? 0;
      const hi = e.price_max ?? lo;
      return lo === hi ? `About ${money(hi)}` : `About ${money(lo)} to ${money(hi)}`;
    }
    default:
      return 'Price unknown. Check the source.';
  }
}

/** Short label for cards and pins. */
export function priceShort(e: Pick<Experience, 'price_kind' | 'price_min' | 'price_max'>): string {
  switch (e.price_kind) {
    case 'free':
      return 'Free';
    case 'exact':
      return money(e.price_max ?? 0);
    case 'estimated':
      return `~${money(e.price_max ?? 0)}`;
    default:
      return 'Price unknown';
  }
}

/** One word for the price type, shown beside the label so exact vs estimated is never colour-only. */
export function priceKindWord(e: Pick<Experience, 'price_kind'>): string {
  return { exact: 'Exact price', estimated: 'Estimated price', free: 'Free', unknown: 'Price unknown' }[e.price_kind];
}

export function durationLabel(min: number | null): string {
  if (!min || min <= 0) return 'Duration not listed';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Timing line for cards: sessions joined, hours text, or "Hours unknown". */
export function timingSummary(e: Pick<Experience, 'timing_kind' | 'sessions' | 'hours_text'>): string {
  if (e.timing_kind === 'fixed' && e.sessions?.length) return e.sessions.map((s) => s.label).join(', ');
  if (e.timing_kind === 'flexible' && e.hours_text) return e.hours_text;
  return 'Hours unknown';
}

/** Provider name for the booking link, taken from the URL host ("www." removed). */
export function providerName(url: string | null): string | null {
  if (!url) return null;
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].replace(/^www\./i, '') : null;
}

export const BOOKING_NOTICE = 'Booking required. Going here does not reserve a spot.';
