import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { myGroupsKey } from '../../groups/overview';
import { EXPERIENCES_KEY, type Experience } from '../../discovery/useExperiences';
import { BucketList } from '../BucketList';
import { bucketErrorMessage, bucketKey, fetchBucketList, setBucketItem, wantLine, wantsKey } from '../bucket';
import { WantToDo } from '../WantToDo';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
let mockWantRows: { group_id: string; user_id: string }[] = [];
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
  from: () => { const b: Record<string, unknown> = {}; b.select = () => b; b.eq = () => Promise.resolve({ data: mockWantRows, error: null }); return b; },
} }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const exp = (id: string, name: string, category: string): Experience => ({ id, name, category, description: '', lat: null, lng: null, area: null,
  image_url: null, timing_kind: 'flexible', hours_text: null, booking_required: false, price_kind: 'free', price_min: 0, price_max: 0 });
const CATALOG = [exp('kayak', 'Kayak on Lady Bird Lake', 'Outdoors'), exp('hike', 'Hill Country sunset hike', 'Outdoors'), exp('pot', 'Pottery drop-in', 'Crafts')];
const group = (id: string, name: string) => ({ id, name, memberCount: 3, faces: [], next: 'Nothing planned yet' });

function client(seed: (c: QueryClient) => void) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(EXPERIENCES_KEY, CATALOG);
  seed(c);
  return c;
}
const wrap = (c: QueryClient, node: ReactNode) => <QueryClientProvider client={c}>{node}</QueryClientProvider>;
const press = (role: 'button' | 'switch', name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole(role, { name })));
const calls = () => mockRpc.mock.calls.filter(([fn]) => fn === 'set_bucket_item');

beforeEach(() => {
  mockRpc.mockReset(); mockPush.mockReset(); mockWantRows = [];
  mockRpc.mockResolvedValue({ data: null, error: null });
});

test('wording: counts only', () => {
  expect(wantLine(4)).toBe('4 want to do this');
  expect(wantLine(1)).toBe('1 wants to do this');
});

test('the list is read through group_bucket_list; a bigint count and the viewer’s own row are understood', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ experience_id: 'kayak', want_count: '4', user_ids: ['me', 'x', 'y', 'z'] },
    { experience_id: 'hike', want_count: 2, user_ids: ['x', 'y'] }], error: null });
  expect(await fetchBucketList('g1', 'me')).toEqual([
    { experienceId: 'kayak', wantCount: 4, mine: true }, { experienceId: 'hike', wantCount: 2, mine: false }]);
  expect(mockRpc).toHaveBeenCalledWith('group_bucket_list', { group_id: 'g1' });
});

test('setBucketItem sends the three arguments; errors are put in words', async () => {
  await setBucketItem('kayak', 'g1', true);
  expect(mockRpc).toHaveBeenCalledWith('set_bucket_item', { experience_id: 'kayak', group_id: 'g1', wanted: true });
  expect(bucketErrorMessage({ message: 'not_a_member' })).toBe('You’re no longer in this group.');
  expect(bucketErrorMessage({ message: 'experience_not_found' })).toBe('This listing was removed.');
  expect(bucketErrorMessage({ message: 'Network request failed' })).toBe('Couldn’t update. Try again.');
});

test('Bucket list: loading, then most wanted first with counts, never names', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ experience_id: 'kayak', want_count: 4, user_ids: ['me'] }, { experience_id: 'pot', want_count: 1, user_ids: ['x'] },
    { experience_id: 'gone', want_count: 3, user_ids: ['y'] }], error: null });
  await render(wrap(client(() => {}), <BucketList groupId="g1" userId="me" />));
  expect(screen.getByText('Loading the bucket list…')).toBeTruthy();
  expect(await screen.findByText('Kayak on Lady Bird Lake')).toBeTruthy();
  expect(screen.getByText('4 want to do this')).toBeTruthy();
  expect(screen.getByText('1 wants to do this')).toBeTruthy();
  expect(screen.queryByText(/gone/)).toBeNull();
  expect(screen.getByText('Crafts')).toBeTruthy();
});

test('Start a pick opens the builder with the activity and the group; Start a plan opens a draft for that group', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ experience_id: 'kayak', want_count: 2, user_ids: [] }], error: null });
  await render(wrap(client(() => {}), <BucketList groupId="g1" userId="me" />));
  await screen.findByText('Kayak on Lady Bird Lake');
  await press('button', 'Start a pick with Kayak on Lady Bird Lake');
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/pick/new', params: { experienceId: 'kayak', groupId: 'g1' } });
  await press('button', 'Start a plan for Kayak on Lady Bird Lake');
  expect(String(mockPush.mock.calls.at(-1)?.[0])).toContain('g1');
  expect(String(mockPush.mock.calls.at(-1)?.[0])).toContain('kayak');
});

test('Bucket list: empty state has one action that goes to Discover', async () => {
  mockRpc.mockResolvedValueOnce({ data: [], error: null });
  await render(wrap(client(() => {}), <BucketList groupId="g1" userId="me" />));
  expect(await screen.findByText('Nothing on the bucket list yet')).toBeTruthy();
  expect(screen.getByText('Open an activity and tap Want to do someday. The most wanted show up here.')).toBeTruthy();
  await press('button', 'Find something to do');
  expect(mockPush).toHaveBeenCalledWith('/discover');
});

test('Bucket list: a failed load says so and Try again reloads', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
  await render(wrap(client(() => {}), <BucketList groupId="g1" userId="me" />));
  expect(await screen.findByText('Couldn’t load the bucket list.')).toBeTruthy();
  mockRpc.mockResolvedValueOnce({ data: [{ experience_id: 'pot', want_count: 1, user_ids: [] }], error: null });
  await press('button', 'Try again');
  expect(await screen.findByText('Pottery drop-in')).toBeTruthy();
});

test('Want to do someday with one group flips it directly, then shows the count in words', async () => {
  const c = client(q => { q.setQueryData([...myGroupsKey, 'me'], [group('g1', 'Friday Crew')]); });
  mockWantRows = [{ group_id: 'g1', user_id: 'x' }];
  await render(wrap(c, <WantToDo experienceId="kayak" experienceName="Kayak" userId="me" />));
  expect(await screen.findByText('Want to do someday')).toBeTruthy();
  await press('button', 'Want to do someday');
  expect(calls()).toEqual([['set_bucket_item', { experience_id: 'kayak', group_id: 'g1', wanted: true }]]);
  mockWantRows = [{ group_id: 'g1', user_id: 'x' }, { group_id: 'g1', user_id: 'me' }];
  await act(async () => { await c.invalidateQueries({ queryKey: wantsKey('kayak') }); });
  expect(await screen.findByText('✓ On the bucket list')).toBeTruthy();
  expect(screen.getByText('2 people in Friday Crew want this.')).toBeTruthy();
  await press('button', /On the bucket list/);
  expect(calls()[1]).toEqual(['set_bucket_item', { experience_id: 'kayak', group_id: 'g1', wanted: false }]);
});

test('with several groups the control opens a sheet with one switch per group', async () => {
  const c = client(q => { q.setQueryData([...myGroupsKey, 'me'], [group('g1', 'Friday Crew'), group('g2', 'Climbing crew')]); });
  mockWantRows = [{ group_id: 'g1', user_id: 'me' }];
  await render(wrap(c, <WantToDo experienceId="kayak" experienceName="Kayak" userId="me" />));
  await screen.findByText('✓ On the bucket list');
  await press('button', /On the bucket list/);
  expect(calls()).toHaveLength(0);
  expect(screen.getByText('Add it to the bucket list of each group that might enjoy it. Members see how many want it, not who.')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Friday Crew' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('switch', { name: 'Climbing crew' }).props.accessibilityState.checked).toBe(false);
  await press('switch', 'Climbing crew');
  expect(calls()).toEqual([['set_bucket_item', { experience_id: 'kayak', group_id: 'g2', wanted: true }]]);
});

test('a failed toggle says why and the switch keeps its old state', async () => {
  const c = client(q => { q.setQueryData([...myGroupsKey, 'me'], [group('g1', 'Friday Crew'), group('g2', 'Climbing crew')]); });
  await render(wrap(c, <WantToDo experienceId="kayak" experienceName="Kayak" userId="me" />));
  await screen.findByText('Want to do someday');
  await press('button', 'Want to do someday');
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await press('switch', 'Friday Crew');
  expect(screen.getByText('Couldn’t update. Try again.')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Friday Crew' }).props.accessibilityState.checked).toBe(false);
});

test('seeded keys exist for the list', () => {
  expect(bucketKey('g1')).toEqual(['bucket-list', 'g1']);
});
