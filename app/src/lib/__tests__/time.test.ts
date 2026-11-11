import { expect, test } from '@jest/globals';
import { closesIn, formatWhen, fromChicagoLocal, toChicagoLocal, zoneLabel } from '../time';

test('wall-clock round trip in standard and daylight time', () => {
  expect(fromChicagoLocal('2026-11-14T10:00')?.toISOString()).toBe('2026-11-14T16:00:00.000Z');
  expect(fromChicagoLocal('2026-07-04T10:00')?.toISOString()).toBe('2026-07-04T15:00:00.000Z');
  expect(toChicagoLocal(new Date('2026-11-14T16:00:00Z'))).toBe('2026-11-14T10:00');
});

test('2:30 AM on the spring-forward Sunday does not exist', () => {
  expect(fromChicagoLocal('2027-03-14T02:30')).toBeNull();
  expect(fromChicagoLocal('2027-03-14T03:30')?.toISOString()).toBe('2027-03-14T08:30:00.000Z');
});

test('1:30 AM on the fall-back Sunday is the first (daylight) one', () => {
  expect(fromChicagoLocal('2026-11-01T01:30')?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
});

test('bad input is rejected', () => {
  expect(fromChicagoLocal('2026-11-14 10:00')).toBeNull();
});

test('the zone is named for the season, and times show in Austin time', () => {
  expect(zoneLabel(new Date('2026-11-14T16:00:00Z'))).toBe('Austin time (CST)');
  expect(zoneLabel(new Date('2026-07-04T15:00:00Z'))).toBe('Austin time (CDT)');
  expect(formatWhen('2026-11-15T02:00:00Z')).toBe('Sat, Nov 14 · 8:00 PM');
  expect(closesIn('2026-11-13T18:20:00Z', Date.parse('2026-11-13T18:00:00Z'))).toBe('closes in 20 min');
});
