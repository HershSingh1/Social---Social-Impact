import type { Experience } from '@/types/database';

const base: Experience = {
  id: 'x', name: 'Test', category: 'outdoors', description: 'A test experience.', lat: 30.27, lng: -97.74, area: 'Zilker',
  price_kind: 'free', price_min: 0, price_max: 0, timing_kind: 'flexible', sessions: null, hours_text: 'Open daily 9 AM to 5 PM',
  duration_min: 90, meeting_point: 'Main gate', booking_required: false, booking_url: null,
  source: 'PLACEHOLDER: test (not a checked listing)', checked_on: '2026-11-01', status: 'active', version: 1,
};
export const exp = (o: Partial<Experience>): Experience => ({ ...base, ...o });

export const SKETCH = exp({ id: 'sketch', name: 'Sketch and stroll', category: 'art_walks', area: 'Shoal Creek', meeting_point: 'Benches at the W 3rd St trailhead' });
export const CLAY = exp({
  id: 'clay', name: 'Clay and conversation', category: 'make', area: 'East Austin', price_kind: 'exact', price_min: 38, price_max: 38,
  timing_kind: 'fixed', sessions: [{ label: 'Sat 10:00 AM' }, { label: 'Sat 1:00 PM' }], hours_text: null, booking_required: true,
  booking_url: 'https://www.example.com/book/clay', meeting_point: 'Studio front desk',
});
export const TRIVIA = exp({
  id: 'trivia', name: 'Tuesday trivia', category: 'games_trivia', area: 'Hyde Park', price_kind: 'unknown', price_min: null, price_max: null,
  timing_kind: 'unknown', hours_text: null,
});
export const CATALOG = [SKETCH, CLAY, TRIVIA];
