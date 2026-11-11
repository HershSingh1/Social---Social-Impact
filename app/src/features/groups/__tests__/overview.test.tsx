import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { FriendsScreen } from '../FriendsScreen';
import { GroupDetailScreen } from '../GroupDetailScreen';
import { fetchMyGroups, nextItem } from '../overview';

type Result = { data: unknown; error: unknown };
// Each table returns a fixed result; filters are recorded but not applied (RLS and filters run on the server).
let mockTables: Record<string, () => Result> = {};
let mockCards: { user_id: string; display_name: string }[] = [];
function mockBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'gt', 'order', 'limit']) builder[m] = () => builder;
  builder.maybeSingle = async () => mockTables[table]();
  builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
    try { return Promise.resolve(mockTables[table]()).then(resolve, reject); } catch (e) { return reject(e); }
  };
  return builder;
}
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: async () => ({ data: mockCards, error: null }),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  removeChannel: async () => {},
} }));

const NOW = Date.parse('2026-11-13T18:00:00Z');
const ok = (data: unknown) => () => ({ data, error: null });

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
  mockCards = [{ user_id: 'maya', display_name: 'Maya' }, { user_id: 'jordan', display_name: 'Jordan' }];
  mockTables = {
    group_members: ok([{ group_id: 'g1', user_id: 'maya' }, { group_id: 'g1', user_id: 'jordan' }]),
    groups: ok([{ id: 'g1', name: 'Saturday crew' }]),
    picks: ok([]),
    plans: ok([{ id: 'p1', group_id: 'g1', experience_name: 'Barton Springs', current_revision: 2 }]),
    plan_revisions: ok([{ plan_id: 'p1', revision: 1, start_at: '2026-11-14T15:00:00Z' }, { plan_id: 'p1', revision: 2, start_at: '2026-11-15T16:00:00Z' }]),
    join_codes: ok({ code: 'K7Q2MX', expires_at: '2026-11-24T18:00:00Z' }),
  };
});

const wrap = (node: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>;

test('next item: an open vote comes first, then the next plan in Austin time', () => {
  const plan = { id: 'p1', name: 'Barton Springs', startAt: '2026-11-15T16:00:00Z' };
  expect(nextItem({ id: 'k', title: 'Saturday?', deadline: '2026-11-13T23:00:00Z' }, plan, NOW)).toBe('Vote open · closes in 5 h');
  expect(nextItem(undefined, plan, NOW)).toBe('Barton Springs · Sun, Nov 15 · 10:00 AM');
  expect(nextItem(undefined, undefined, NOW)).toBe('Nothing planned yet');
});

test('a group summary counts members, shows up to four faces, and uses the current revision time', async () => {
  const [group] = await fetchMyGroups('maya', NOW);
  expect(group).toEqual({
    id: 'g1', name: 'Saturday crew', memberCount: 2,
    faces: [{ id: 'maya', name: 'Maya' }, { id: 'jordan', name: 'Jordan' }],
    next: 'Barton Springs · Sun, Nov 15 · 10:00 AM',
  });
});

test('Friends: no groups shows the empty state with Create and Join', async () => {
  mockTables.group_members = ok([]);
  const onJoin = jest.fn();
  await render(wrap(<FriendsScreen userId="maya" onCreate={() => {}} onJoin={onJoin} onOpenGroup={() => {}} />));
  expect(await screen.findByText('No groups yet')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Join with code' })));
  expect(onJoin).toHaveBeenCalled();
});

test('Friends: an error offers Try again, and the retry shows the groups', async () => {
  let fail = true;
  mockTables.groups = () => (fail ? { data: null, error: new Error('offline') } : { data: [{ id: 'g1', name: 'Saturday crew' }], error: null });
  const onOpenGroup = jest.fn();
  await render(wrap(<FriendsScreen userId="maya" onCreate={() => {}} onJoin={() => {}} onOpenGroup={onOpenGroup} />));
  expect(await screen.findByText('Couldn’t load your groups.')).toBeTruthy();
  fail = false;
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
  const row = await screen.findByRole('button', { name: /^Saturday crew, 2 members/ });
  await act(async () => fireEvent.press(row));
  expect(onOpenGroup).toHaveBeenCalledWith('g1');
});

test('Group page: members, join code, no open vote, the invited plan and the hidden-plans note', async () => {
  mockTables.groups = ok({ name: 'Saturday crew' });
  mockTables.group_members = ok([{ user_id: 'maya', role: 'owner' }, { user_id: 'jordan', role: 'member' }]);
  const onOpenPlan = jest.fn();
  await render(wrap(<GroupDetailScreen groupId="g1" onOpenPick={() => {}} onOpenPlan={onOpenPlan} />));
  expect(await screen.findByText('2 members')).toBeTruthy();
  expect(screen.getByText('K7Q 2MX')).toBeTruthy();
  expect(screen.getByText('No vote open right now.')).toBeTruthy();
  expect(screen.getByText('Plans you weren’t invited to stay hidden.')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: /^Barton Springs/ })));
  expect(onOpenPlan).toHaveBeenCalledWith('p1');
});
