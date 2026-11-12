import { expect, test } from '@jest/globals';
import { filterToRegion, INITIAL_AREA_SEARCH, isInRegion, updateAreaSearch } from '../area';

const region = { latitude: 30.27, longitude: -97.74, latitudeDelta: 0.04, longitudeDelta: 0.06 };

test('the viewport includes its edges and excludes missing or outside coordinates', () => {
  expect(isInRegion({ lat: 30.25, lng: -97.77 }, region)).toBe(true);
  expect(isInRegion({ lat: 30.29, lng: -97.71 }, region)).toBe(true);
  expect(isInRegion({ lat: 30.3, lng: -97.74 }, region)).toBe(false);
  expect(isInRegion({ lat: null, lng: -97.74 }, region)).toBe(false);
});

test('no region preserves the shared result set; a region returns only visible coordinates', () => {
  const items = [
    { id: 'inside', lat: 30.26, lng: -97.74 },
    { id: 'outside', lat: 30.4, lng: -97.74 },
    { id: 'unmapped', lat: null, lng: null },
  ];
  expect(filterToRegion(items)).toBe(items);
  expect(filterToRegion(items, region).map(item => item.id)).toEqual(['inside']);
});

test('only an explicit apply changes results after a user pan', () => {
  expect(updateAreaSearch(INITIAL_AREA_SEARCH, { type: 'region-complete', region })).toBe(INITIAL_AREA_SEARCH);
  const panned = updateAreaSearch(INITIAL_AREA_SEARCH, { type: 'user-touch' });
  const ready = updateAreaSearch(panned, { type: 'region-complete', region });
  expect(ready).toEqual({ candidate: region, userMoved: false });
  expect(updateAreaSearch(ready, { type: 'apply' })).toEqual({ applied: region, userMoved: false });
  expect(updateAreaSearch({ applied: region, userMoved: false }, { type: 'clear' })).toEqual(INITIAL_AREA_SEARCH);
});

test('a Locate me move after a touch does not offer Search this area', () => {
  const touched = updateAreaSearch(INITIAL_AREA_SEARCH, { type: 'user-touch' });
  const located = updateAreaSearch(touched, { type: 'app-move' });
  expect(updateAreaSearch(located, { type: 'region-complete', region })).toEqual(INITIAL_AREA_SEARCH);
});

test('apply without a moved map changes nothing', () => {
  expect(updateAreaSearch(INITIAL_AREA_SEARCH, { type: 'apply' })).toBe(INITIAL_AREA_SEARCH);
});
