import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FiltersProvider } from '../FiltersContext';
import { MapListScreen } from '../MapListScreen';
import { matchesSearch } from '../search';
import { EXPERIENCES_KEY, type Experience } from '../useExperiences';

const mockAnimate = jest.fn();
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = React.forwardRef(function MockMap({ children, initialRegion, onTouchStart, onRegionChangeComplete }: {
    children: React.ReactNode; initialRegion: object; onTouchStart?: () => void; onRegionChangeComplete?: (region: object) => void;
  }, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate }));
    return <View testID="map" accessibilityHint={JSON.stringify(initialRegion)}
      {...{ onTouchStart, onRegionChangeComplete }}>{children}</View>;
  });
  function Marker({ title, onPress }: { title: string; onPress: (e: { stopPropagation: () => void }) => void }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={`Pin ${title}`} onPress={() => onPress({ stopPropagation: () => {} })} />;
  }
  return { __esModule: true, default: MapView, Marker };
});
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 30.3, longitude: -97.7 } })),
}));
jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

const row = (id: string, name: string, category: string, area: string, extra: Partial<Experience> = {}): Experience => ({
  id, name, category, area, description: '', lat: 30.26, lng: -97.74, image_url: null, timing_kind: 'flexible', hours_text: '9 AM–5 PM',
  booking_required: false, price_kind: 'exact', price_min: 20, price_max: 20, ...extra,
});
const CATALOG = [
  row('a', 'Barton Springs Pool', 'Outdoors', 'Zilker', { lng: -97.77, price_kind: 'estimated', price_min: 5, price_max: 9 }),
  row('b', 'Clay and conversation', 'Make something', 'East Austin', { lng: -97.72, booking_required: true }),
  row('c', 'Sketch and stroll', 'Art and walks', 'Downtown', { lng: -97.74, price_kind: 'free', price_min: 0, price_max: 0 }),
];

const onOpen = jest.fn();
async function show() {
  const client = new QueryClient();
  client.setQueryData(EXPERIENCES_KEY, CATALOG);
  await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <QueryClientProvider client={client}><FiltersProvider><MapListScreen onOpen={onOpen} /></FiltersProvider></QueryClientProvider>
  </SafeAreaProvider>);
}
const press = (role: 'button' | 'checkbox', name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole(role, { name })));

beforeEach(() => { jest.useFakeTimers(); onOpen.mockReset(); mockAnimate.mockReset(); });

test('search matches name, area and category, every word', () => {
  expect(matchesSearch(CATALOG[0], 'zilker')).toBe(true);
  expect(matchesSearch(CATALOG[1], 'make east')).toBe(true);
  expect(matchesSearch(CATALOG[2], 'outdoors')).toBe(false);
});

test('a pin shows the preview card, and tapping the card opens Detail', async () => {
  await show();
  await press('button', 'Pin Clay and conversation');
  expect(screen.getByText('Make something · East Austin')).toBeTruthy();
  expect(screen.getByText('$20 · 9 AM–5 PM')).toBeTruthy();
  expect(screen.getByText('Booking required')).toBeTruthy();
  await press('button', 'Clay and conversation, open details');
  expect(onOpen).toHaveBeenCalledWith('b');
});

test('search waits 300 ms, and search and selection survive switching to the List', async () => {
  await show();
  await press('button', 'Pin Barton Springs Pool');
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Search'), 'pool'); });
  expect(screen.getByRole('button', { name: 'Pin Sketch and stroll' })).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.queryByRole('button', { name: 'Pin Sketch and stroll' })).toBeNull();

  await press('checkbox', 'List');
  expect(screen.getByRole('button', { name: 'Barton Springs Pool, selected' })).toBeTruthy();
  expect(screen.queryByText('Sketch and stroll')).toBeNull();
  await press('checkbox', 'Map');
  expect(screen.getByLabelText('Search').props.value).toBe('pool');
  expect(screen.getByText('Outdoors · Zilker')).toBeTruthy(); // the preview card is still open
});

test('no search match offers Clear search', async () => {
  await show();
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Search'), 'bowling'); });
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.getByText('Nothing matches “bowling”')).toBeTruthy();
  await press('button', 'Clear search');
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.getByRole('button', { name: 'Pin Sketch and stroll' })).toBeTruthy();
});

test('location is asked for only on Locate; denied keeps downtown Austin and everything still works', async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
  await show();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByTestId('map').props.accessibilityHint)).toMatchObject({ latitude: 30.2672, longitude: -97.7431 });
  await press('button', 'Locate me');
  expect(screen.getByText(/Location is off, so the map stays on downtown Austin/)).toBeTruthy();
  expect(mockAnimate).not.toHaveBeenCalled();
  await press('button', 'Pin Sketch and stroll');
  await press('button', 'Sketch and stroll, open details');
  expect(onOpen).toHaveBeenCalledWith('c');
});

test('location allowed moves the map to the person', async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  await show();
  await press('button', 'Locate me');
  expect(mockAnimate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 30.3, longitude: -97.7 }));
});

test('moving the map waits for Search this area, then Map and List share the applied bounds', async () => {
  await show();
  const map = screen.getByTestId('map');
  const eastAustin = { latitude: 30.26, longitude: -97.72, latitudeDelta: 0.04, longitudeDelta: 0.02 };

  await act(async () => { map.props.onRegionChangeComplete(eastAustin); });
  expect(screen.queryByRole('button', { name: 'Search this area' })).toBeNull(); // programmatic moves do not prompt
  await act(async () => {
    map.props.onTouchStart();
    map.props.onRegionChangeComplete(eastAustin);
  });
  expect(screen.getByRole('button', { name: 'Pin Barton Springs Pool' })).toBeTruthy(); // panning alone keeps results
  expect(screen.getByRole('button', { name: 'Search this area' })).toBeTruthy();

  await press('button', 'Search this area');
  expect(screen.queryByRole('button', { name: 'Pin Barton Springs Pool' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Pin Clay and conversation' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'In this area' })).toBeTruthy();

  await press('checkbox', 'List');
  expect(screen.getByText('Clay and conversation')).toBeTruthy();
  expect(screen.queryByText('Barton Springs Pool')).toBeNull();

  await press('checkbox', 'In this area');
  expect(screen.getByText('Barton Springs Pool')).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'In this area' })).toBeNull();
});
