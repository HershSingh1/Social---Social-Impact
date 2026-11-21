import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLLECTIONS_KEY } from '../../bucket/collections';
import { FiltersProvider } from '../../discovery/FiltersContext';
import { MapListScreen } from '../../discovery/MapListScreen';
import { savesKey } from '../../discovery/saves';
import { EXPERIENCES_KEY, type Experience } from '../../discovery/useExperiences';
import { myGroupsKey } from '../../groups/overview';
import { BudgetOptIn } from '../BudgetOptIn';
import { fetchHidden, fetchOptIn, setOptIn } from '../budget';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
let mockOptIn: boolean | undefined;
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
  from: () => { const b: Record<string, unknown> = {}; b.select = () => b; b.eq = () => b;
    b.maybeSingle = async () => ({ error: null, data: mockOptIn === undefined ? null : { budget_opt_in: mockOptIn } }); return b; },
} }));
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = React.forwardRef(function MockMap({ children }: { children: React.ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
    return <View>{children}</View>;
  });
  function Marker({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: (e: { stopPropagation: () => void }) => void }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={`Pin ${accessibilityLabel}`} onPress={() => onPress({ stopPropagation: () => {} })} />;
  }
  return { __esModule: true, default: MapView, Marker };
});
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));

const press = (name: string | RegExp, role: 'button' | 'checkbox' = 'button') => act(async () => fireEvent.press(screen.getByRole(role, { name })));
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const hiddenCalls = () => mockRpc.mock.calls.filter(([fn]) => fn === 'group_budget_hidden');

beforeEach(() => { mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: null, error: null }); mockOptIn = false; });

test('the hidden ids come back as ids only; null means not available', async () => {
  mockRpc.mockResolvedValueOnce({ data: ['b', 'd'], error: null });
  expect(await fetchHidden('g1', ['a', 'b', 'c', 'd'])).toEqual(['b', 'd']);
  expect(mockRpc).toHaveBeenCalledWith('group_budget_hidden', { group_id: 'g1', experience_ids: ['a', 'b', 'c', 'd'] });
  mockRpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await fetchHidden('g1', ['a'])).toBeNull();
});

test('more than 500 activities are asked in chunks and joined', async () => {
  const ids = Array.from({ length: 1100 }, (_, i) => `e${i}`);
  mockRpc.mockResolvedValueOnce({ data: ['e1'], error: null }).mockResolvedValueOnce({ data: ['e600'], error: null }).mockResolvedValueOnce({ data: [], error: null });
  expect(await fetchHidden('g1', ids)).toEqual(['e1', 'e600']);
  expect(hiddenCalls().map(([, a]) => (a.experience_ids as string[]).length)).toEqual([500, 500, 100]);
});

test('a server error never reaches the screen: its text is dropped', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'lowest cap is 25 for group g1' } });
  await expect(fetchHidden('g1', ['a'])).rejects.toThrow('budget_check_failed');
  await expect(fetchHidden('g1', ['a'])).resolves.toBeNull();
});

test('the opt-in is read from your own row and written through set_budget_opt_in', async () => {
  mockOptIn = true;
  expect(await fetchOptIn('me')).toBe(true);
  mockOptIn = undefined;
  expect(await fetchOptIn('me')).toBe(false);
  await setOptIn(true);
  expect(mockRpc).toHaveBeenCalledWith('set_budget_opt_in', { opt_in: true });
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrap = (node: ReactNode, c = client()) => <QueryClientProvider client={c}>{node}</QueryClientProvider>;

test('the switch starts off, says nobody sees your amount, and turns on once', async () => {
  await render(wrap(<BudgetOptIn userId="me" />));
  expect(await screen.findByText('Nobody sees your amount. The filter hides activities above the lowest budget among people who opted in, and only when at least 3 people have.')).toBeTruthy();
  expect(screen.getByLabelText('Use my budget in group filters').props.value).toBe(false);
  await act(async () => fireEvent(screen.getByLabelText('Use my budget in group filters'), 'valueChange', true));
  expect(mockRpc.mock.calls.filter(([fn]) => fn === 'set_budget_opt_in')).toEqual([['set_budget_opt_in', { opt_in: true }]]);
  expect(screen.getByLabelText('Use my budget in group filters').props.value).toBe(true);
  expect(screen.getByText('On')).toBeTruthy();
});

test('a failed change says so and the switch keeps its old state', async () => {
  mockOptIn = true;
  await render(wrap(<BudgetOptIn userId="me" />));
  await screen.findByText('On');
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await act(async () => fireEvent(screen.getByLabelText('Use my budget in group filters'), 'valueChange', false));
  expect(screen.getByText('Couldn’t update. Try again.')).toBeTruthy();
  expect(screen.getByLabelText('Use my budget in group filters').props.value).toBe(true);
});

const exp = (id: string, name: string, over: Partial<Experience> = {}): Experience => ({ id, name, category: 'Outdoors', description: '', lat: 30.26, lng: -97.74,
  area: null, image_url: null, timing_kind: 'flexible', hours_text: null, booking_required: false, price_kind: 'exact', price_min: 20, price_max: 20, ...over });
const CATALOG = [exp('cheap', 'Sketch and stroll', { price_min: 18, price_max: 18 }), exp('pricey', 'Kayak on Lady Bird Lake', { price_min: 45, price_max: 45 }),
  exp('free', 'Barton Springs', { price_kind: 'free', price_min: 0, price_max: 0 }), exp('unknown', 'Trail of Lights', { price_kind: 'unknown', price_min: null, price_max: null })];
const group = { id: 'g1', name: 'Friday Crew', memberCount: 4, faces: [], next: 'Nothing planned yet' };

async function show() {
  const c = client();
  c.setQueryData(EXPERIENCES_KEY, CATALOG);
  c.setQueryData(COLLECTIONS_KEY, []);
  c.setQueryData([...myGroupsKey, 'me'], [group]);
  // The group chip shows what the group saved, so everything in this catalog is saved to Friday Crew.
  c.setQueryData([...savesKey, 'me'], CATALOG.map(e => ({ experience_id: e.id, user_id: 'x', group_id: 'g1' })));
  await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    {wrap(<FiltersProvider><MapListScreen onOpen={() => {}} userId="me" /></FiltersProvider>, c)}
  </SafeAreaProvider>);
}

test('no chip anywhere until a group is chosen, and none when the server has no list for it', async () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  await show();
  expect(screen.queryByRole('checkbox', { name: 'Fits everyone’s budget' })).toBeNull();
  expect(hiddenCalls()).toHaveLength(0);
  await press('Friday Crew', 'checkbox');
  await flush();
  expect(hiddenCalls()).toHaveLength(1);
  expect(screen.queryByRole('checkbox', { name: 'Fits everyone’s budget' })).toBeNull();
  expect(screen.queryByText(/budget/i)).toBeNull(); // no explanation, so no count can be worked out
});

test('with a list the chip appears off, then hides those activities, keeps unknown prices and says no budget is shown', async () => {
  mockRpc.mockResolvedValue({ data: ['pricey'], error: null });
  await show();
  await press('Friday Crew', 'checkbox');
  await flush();
  expect(screen.getByRole('checkbox', { name: 'Fits everyone’s budget' }).props.accessibilityState.checked).toBe(false);
  await press('Show list');
  expect(screen.getByText('Kayak on Lady Bird Lake')).toBeTruthy();
  await press('Fits everyone’s budget', 'checkbox');
  expect(screen.getByRole('checkbox', { name: 'Fits everyone’s budget' }).props.accessibilityState.checked).toBe(true);
  expect(screen.queryByText('Kayak on Lady Bird Lake')).toBeNull();
  expect(screen.getByText('Sketch and stroll')).toBeTruthy();
  expect(screen.getByText('Barton Springs')).toBeTruthy();
  expect(screen.getByText('Trail of Lights')).toBeTruthy();
  expect(screen.getByText('Price unknown · Hours unverified')).toBeTruthy();
  expect(screen.getByText('Hiding activities above what everyone in this group opted in to spend. Nobody’s budget is shown.')).toBeTruthy();
  await press('Fits everyone’s budget', 'checkbox');
  expect(screen.getByText('Kayak on Lady Bird Lake')).toBeTruthy();
});

test('if the chip hides everything it says so, and Turn the filter off brings them back', async () => {
  mockRpc.mockResolvedValue({ data: CATALOG.map(e => e.id), error: null });
  await show();
  await press('Friday Crew', 'checkbox');
  await flush();
  await press('Fits everyone’s budget', 'checkbox');
  expect(screen.getByText('Nothing fits everyone’s budget')).toBeTruthy();
  expect(screen.getByText('Turn the filter off to see all activities.')).toBeTruthy();
  await press('Turn the filter off');
  await press('Show list');
  expect(screen.getByText('Sketch and stroll')).toBeTruthy();
});

test('a failed check keeps every activity, says so with no server text, and Try again asks again', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'cap 25 is the lowest' } });
  await show();
  await press('Friday Crew', 'checkbox');
  await flush();
  expect(screen.getByText('Couldn’t check the group’s budgets. Showing every activity.')).toBeTruthy();
  expect(screen.queryByText(/lowest|cap 25/i)).toBeNull(); // the server's text is never shown
  expect(screen.queryByRole('checkbox', { name: 'Fits everyone’s budget' })).toBeNull();
  mockRpc.mockResolvedValueOnce({ data: ['pricey'], error: null });
  await press('Try again');
  await flush();
  expect(screen.getByRole('checkbox', { name: 'Fits everyone’s budget' })).toBeTruthy();
  expect(screen.queryByText('Couldn’t check the group’s budgets. Showing every activity.')).toBeNull();
});
