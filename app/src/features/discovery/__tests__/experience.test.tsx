import { describe, expect, test } from '@jest/globals';
import { formatCheckedOn, formatDuration, formatLocation, formatPrice, formatTiming } from '../experience';

describe('experience detail labels', () => {
  test.each([
    [{ price_kind: 'exact' as const, price_min: 38, price_max: 38 }, '$38 per person'],
    [{ price_kind: 'estimated' as const, price_min: 5, price_max: 9 }, 'About $5 to $9'],
    [{ price_kind: 'free' as const, price_min: 0, price_max: 0 }, 'Free'],
    [{ price_kind: 'unknown' as const, price_min: null, price_max: null }, 'Price unknown. Check the source.'],
  ])('formats every price kind without an empty label', (price, expected) => {
    expect(formatPrice(price)).toBe(expected);
  });

  test('formats fixed sessions as Austin wall-clock choices', () => {
    expect(formatTiming({
      timing_kind: 'fixed', hours_text: null,
      sessions: [{ start_local: '2026-11-14T10:00' }, { start_local: '2026-11-15T14:30' }],
    })).toEqual({
      label: 'Fixed sessions', detail: 'Plans must use one of these sessions', sessions: ['Sat 10:00 AM', 'Sun 2:30 PM'],
    });
  });

  test.each([
    [{ timing_kind: 'fixed' as const, sessions: null, hours_text: 'Reported Tuesdays, 8 p.m.' }, 'Reported Tuesdays, 8 p.m.', 'Plans must use one of these sessions'],
    [{ timing_kind: 'flexible' as const, sessions: null, hours_text: 'Wed–Sun, 10 a.m.–6 p.m.' }, 'Wed–Sun, 10 a.m.–6 p.m.', 'Pick any time within these hours'],
    [{ timing_kind: 'unknown' as const, sessions: null, hours_text: null }, 'Hours unknown', 'Check the source before making a plan.'],
  ])('formats every timing kind without an empty label', (timing, label, detail) => {
    expect(formatTiming(timing)).toMatchObject({ label, detail });
  });

  test('missing catalog facts get honest non-empty fallbacks', () => {
    expect(formatPrice({ price_kind: 'exact', price_min: null, price_max: null })).toBe('Price unavailable. Check the source.');
    expect(formatDuration(null)).toBe('Duration varies');
    expect(formatLocation({ area: null, address: null })).toBe('Location being checked');
    expect(formatCheckedOn(null)).toBe('Not yet checked');
  });
});
