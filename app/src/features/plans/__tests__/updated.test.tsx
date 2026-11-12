import { expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { ReconfirmBanner } from '../ReconfirmBanner';
import type { Revision } from '../plan';
import { changeRows, isMinorUpdate, priceChangeLine, priceShort } from '../updated';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const rev = (over: Partial<Revision> = {}): Revision => ({ revision: 1, startAt: '2099-11-14T16:00:00Z', endAt: '2099-11-14T18:00:00Z',
  meetingPoint: 'South gate', note: null, price: { kind: 'exact', min: 12, max: 12 }, bookingRequired: false, ...over });

test('prices read short, for a before and after', () => {
  expect(priceShort({ kind: 'free', min: 0, max: 0 })).toBe('Free');
  expect(priceShort({ kind: 'exact', min: 12, max: 12 })).toBe('$12');
  expect(priceShort({ kind: 'estimated', min: 12, max: 15 })).toBe('About $12–$15');
  expect(priceShort({ kind: 'unknown', min: null, max: null })).toBe('not confirmed');
});

test('a price change line appears only when the price really changed', () => {
  expect(priceChangeLine({ kind: 'exact', min: 18, max: 18, previous: { kind: 'exact', min: 12, max: 12 } })).toBe('Price was $12, now $18');
  expect(priceChangeLine({ kind: 'exact', min: 12, max: 12, previous: { kind: 'exact', min: 12, max: 12 } })).toBeNull();
  expect(priceChangeLine({ kind: 'exact', min: 12, max: 12 })).toBeNull();
  expect(priceChangeLine({ kind: 'exact', min: 18, max: 18, previous: { kind: 'unknown', min: null, max: null } })).toBe('Price was not confirmed, now $18');
});

test('the banner lists every changed field, old and new', () => {
  const was = rev();
  const now = rev({ revision: 2, startAt: '2099-11-14T17:00:00Z', endAt: '2099-11-14T19:00:00Z', meetingPoint: 'North gate',
    price: { kind: 'exact', min: 18, max: 18, previous: { kind: 'exact', min: 12, max: 12 } }, bookingRequired: true });
  expect(changeRows(was, now).map(r => r.label)).toEqual(['When', 'Where', 'Price', 'Booking']);
  expect(changeRows(was, now).find(r => r.label === 'Booking')).toMatchObject({ before: 'No booking needed', after: 'Booking required' });
  expect(changeRows(was, rev({ revision: 2, meetingPoint: 'North gate' })).map(r => r.label)).toEqual(['Where']);
  expect(changeRows(was, rev({ revision: 2 }))).toEqual([]);
});

test('the reconfirm banner shows each change as was and now', async () => {
  const now = rev({ revision: 2, meetingPoint: 'North gate', bookingRequired: true });
  await render(<ReconfirmBanner was={rev()} now={now} onAnswer={async () => {}} errorMessage={() => 'x'} />);
  expect(screen.getByText('Was: South gate')).toBeTruthy();
  expect(screen.getByText('Now: North gate')).toBeTruthy();
  expect(screen.getByText('Was: No booking needed')).toBeTruthy();
  expect(screen.getByText('Now: Booking required')).toBeTruthy();
});

test('only an edit that kept the same revision counts as Updated', () => {
  const seen = { revision: 1, updatedAt: '2099-01-01T00:00:00Z' };
  expect(isMinorUpdate(null, seen)).toBe(false);
  expect(isMinorUpdate(seen, seen)).toBe(false);
  expect(isMinorUpdate(seen, { revision: 1, updatedAt: '2099-01-02T00:00:00Z' })).toBe(true);
  expect(isMinorUpdate(seen, { revision: 2, updatedAt: '2099-01-02T00:00:00Z' })).toBe(false);
});
