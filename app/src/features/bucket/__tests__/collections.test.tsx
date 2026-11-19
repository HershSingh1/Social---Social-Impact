import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FiltersProvider } from '../../discovery/FiltersContext';
import { MapListScreen } from '../../discovery/MapListScreen';
import { EXPERIENCES_KEY, type Experience } from '../../discovery/useExperiences';
import { collectionLine, COLLECTIONS_KEY, formatDate, hasUpcoming, seasonalIds, type Collection } from '../collections';

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = React.forwardRef(function MockMap({ children }: { children: React.ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return <View testID="map">{children}</View>;
  });
  function Marker({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: (e: { stopPropagation: () => void }) => void }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={`Pin ${accessibilityLabel}`} onPress={() => onPress({ stopPropagation: () => {} })} />;
  }
  return { __esModule: true, default: MapView, Marker };
});
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

const TODAY = '2026-11-19';
const exp = (id: string, name: string, extra: Partial<Experience> = {}): Experience => ({ id, name, category: 'Outdoors', description: '', lat: 30.26, lng: -97.74,
  area: null, image_url: null, timing_kind: 'flexible', hours_text: '9 AM–5 PM', booking_required: false, price_kind: 'free', price_min: 0, price_max: 0, ...extra });
const CATALOG = [
  exp('pumpkin', 'Pumpkin patch'), exp('foliage', 'Fall foliage'), exp('pool', 'Barton Springs Pool'),
  exp('past', 'Harvest festival', { timing_kind: 'fixed', sessions: [{ start_local: '2026-11-01T10:00', end_local: '2026-11-01T12:00' }] }),
  exp('soon', 'Lantern night', { timing_kind: 'fixed', sessions: [{ start_local: '2026-11-25T18:00', end_local: '2026-11-25T20:00' }] }),
];
const fall: Collection = { id: 'c1', name: 'Fall in Austin', curatorName: 'Ana', startsOn: '2026-09-22', endsOn: '2026-12-01', reviewOn: '2026-11-17',
  experienceIds: ['pumpkin', 'foliage', 'past', 'soon', 'removed'] };

test('a collection shows what is in the catalog with something still to do, and only inside its dates', () => {
  expect([...seasonalIds(fall, CATALOG, TODAY)].sort()).toEqual(['foliage', 'pumpkin', 'soon']);
  expect(seasonalIds(fall, CATALOG, '2026-12-02').size).toBe(0);
  expect(seasonalIds(fall, CATALOG, '2026-09-21').size).toBe(0);
  expect(seasonalIds(fall, CATALOG, '2026-12-01').size).toBe(2);
});

test('set sessions all in the past are hidden; flexible and unknown timing stay', () => {
  expect(hasUpcoming({ timing_kind: 'fixed', sessions: [{ start_local: '2026-11-18T10:00' }] }, TODAY)).toBe(false);
  expect(hasUpcoming({ timing_kind: 'fixed', sessions: [{ start_local: '2026-11-19T18:00' }] }, TODAY)).toBe(true);
  expect(hasUpcoming({ timing_kind: 'fixed', sessions: null }, TODAY)).toBe(false);
  expect(hasUpcoming({ timing_kind: 'flexible', sessions: null }, TODAY)).toBe(true);
  expect(hasUpcoming({ timing_kind: 'unknown', sessions: null }, TODAY)).toBe(true);
});

test('the line says who picked it, until when and when it was reviewed', () => {
  expect(formatDate('2026-12-01')).toBe('Dec 1');
  expect(collectionLine(fall)).toBe('Fall in Austin · picked by Ana · through Dec 1. Reviewed Nov 17.');
});

async function show(collections: Collection[]) {
  const client = new QueryClient();
  client.setQueryData(EXPERIENCES_KEY, CATALOG);
  client.setQueryData(COLLECTIONS_KEY, collections);
  await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <QueryClientProvider client={client}><FiltersProvider><MapListScreen onOpen={() => {}} /></FiltersProvider></QueryClientProvider>
  </SafeAreaProvider>);
}
const press = (role: 'button' | 'checkbox', name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole(role, { name })));

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-19T18:00:00Z') }); });

test('the map offers the collection as a chip; choosing it narrows the pins and says who picked it', async () => {
  await show([fall]);
  expect(screen.getByRole('button', { name: 'Pin Barton Springs Pool' })).toBeTruthy();
  await press('checkbox', 'Fall in Austin');
  expect(screen.getByRole('button', { name: 'Pin Pumpkin patch' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Pin Barton Springs Pool' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pin Harvest festival' })).toBeNull();
  expect(screen.getByText('Fall in Austin · picked by Ana · through Dec 1. Reviewed Nov 17.')).toBeTruthy();
  await press('checkbox', /Fall in Austin/);
  expect(screen.getByRole('button', { name: 'Pin Barton Springs Pool' })).toBeTruthy();
  expect(screen.queryByText(/picked by Ana/)).toBeNull();
});

test('a collection past its end date, or with nothing left to do, shows no chip', async () => {
  await show([{ ...fall, endsOn: '2026-11-18' }, { ...fall, id: 'c2', name: 'Harvest', experienceIds: ['past'] }]);
  expect(screen.queryByRole('checkbox', { name: 'Fall in Austin' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Harvest' })).toBeNull();
});
