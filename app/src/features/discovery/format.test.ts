import { BOOKING_NOTICE, durationLabel, priceKindWord, priceLabel, priceShort, providerName, timingSummary } from './format';

describe('price labels (P0-06)', () => {
  it('exact, estimated (range and single), free and unknown', () => {
    expect(priceLabel({ price_kind: 'exact', price_min: 38, price_max: 38 })).toBe('$38 per person');
    expect(priceLabel({ price_kind: 'estimated', price_min: 5, price_max: 9 })).toBe('About $5 to $9');
    expect(priceLabel({ price_kind: 'estimated', price_min: 25, price_max: 25 })).toBe('About $25');
    expect(priceLabel({ price_kind: 'free', price_min: 0, price_max: 0 })).toBe('Free');
    expect(priceLabel({ price_kind: 'unknown', price_min: null, price_max: null })).toBe('Price unknown. Check the source.');
  });
  it('short labels for cards and pins', () => {
    expect(priceShort({ price_kind: 'exact', price_min: 38, price_max: 38 })).toBe('$38');
    expect(priceShort({ price_kind: 'estimated', price_min: 5, price_max: 9 })).toBe('~$9');
    expect(priceShort({ price_kind: 'free', price_min: 0, price_max: 0 })).toBe('Free');
    expect(priceShort({ price_kind: 'unknown', price_min: null, price_max: null })).toBe('Price unknown');
    expect(priceKindWord({ price_kind: 'estimated' })).toBe('Estimated price');
  });
});

describe('durations, timing, booking', () => {
  it('formats durations', () => {
    expect(durationLabel(90)).toBe('1 hr 30 min');
    expect(durationLabel(60)).toBe('1 hr');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(null)).toBe('Duration not listed');
  });
  it('summarises timing', () => {
    expect(timingSummary({ timing_kind: 'fixed', sessions: [{ label: 'Sat 10:00 AM' }, { label: 'Sun 11:00 AM' }], hours_text: null })).toBe('Sat 10:00 AM, Sun 11:00 AM');
    expect(timingSummary({ timing_kind: 'flexible', sessions: null, hours_text: 'Daily 11 AM to 11 PM' })).toBe('Daily 11 AM to 11 PM');
    expect(timingSummary({ timing_kind: 'unknown', sessions: null, hours_text: null })).toBe('Hours unknown');
  });
  it('names the booking provider from its link and uses the spec notice', () => {
    expect(providerName('https://www.example.com/book?x=1')).toBe('example.com');
    expect(providerName(null)).toBeNull();
    expect(BOOKING_NOTICE).toBe('Booking required. Going here does not reserve a spot.');
  });
});
