import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GroupDetailScreen } from '../GroupDetailScreen';
import { confirmCopy } from '../GroupManage';
import { leaveGroup, manageMessage, removeMember } from '../manage';

type Result = { data: unknown; error: { message: string } | null };
let mockRoster: Result;
let mockRemoved: Result;
let mockRpc: Record<string, () => Result>;
const mockCalls: [string, unknown][] = [];

function mockBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'in', 'gt', 'order', 'limit']) builder[m] = () => builder;
  builder.eq = (column: string, value: unknown) => { filters[column] = value; return builder; };
  builder.maybeSingle = async () => table === 'groups' ? { data: { name: 'Saturday crew' }, error: null }
    : { data: { code: 'K7Q2MX', expires_at: '2026-11-25T18:00:00Z' }, error: null };
  builder.then = (resolve: (r: Result) => unknown) => resolve(
    table !== 'group_members' ? { data: [], error: null } : filters.blocked === true ? mockRemoved : mockRoster);
  return builder;
}
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: async (fn: string, args: unknown) => { mockCalls.push([fn, args]); return mockRpc[fn]?.() ?? { data: null, error: null }; },
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  removeChannel: async () => {},
} }));

const cards = [{ user_id: 'maya', display_name: 'Maya' }, { user_id: 'jordan', display_name: 'Jordan' }];
beforeEach(() => {
  mockCalls.length = 0;
  mockRoster = { data: [{ user_id: 'maya', role: 'owner' }, { user_id: 'jordan', role: 'member' }], error: null };
  mockRemoved = { data: [], error: null };
  mockRpc = { get_profile_cards: () => ({ data: cards, error: null }) };
});

function renderAs(userId: string, onBack = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>
    <GroupDetailScreen groupId="g1" userId={userId} onOpenPick={() => {}} onOpenPlan={() => {}} onBack={onBack} />
  </QueryClientProvider>);
}
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

test('members see Leave group but none of the owner controls', async () => {
  await renderAs('jordan');
  expect(await screen.findByText('K7Q 2MX')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Leave Saturday crew' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Revoke group code' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Manage/ })).toBeNull();
});

test('the owner revokes the code after confirming', async () => {
  await renderAs('maya');
  await screen.findByText('K7Q 2MX');
  expect(screen.queryByRole('button', { name: 'Manage Maya' })).toBeNull();
  await press('Revoke group code');
  expect(screen.getByText('Revoke K7Q 2MX?')).toBeTruthy();
  await press('Revoke code');
  expect(mockCalls).toContainEqual(['revoke_code', { group_id: 'g1' }]);
  expect(await screen.findByText('Code revoked. Current members stay.')).toBeTruthy();
});

test('the owner removes a member, and a server refusal stays on the sheet', async () => {
  mockRpc.remove_member = () => ({ data: null, error: { message: 'not_owner' } });
  await renderAs('maya');
  await screen.findByText('K7Q 2MX');
  await press('Manage Jordan');
  await press('Remove Jordan from the group');
  expect(screen.getByText('Remove Jordan?')).toBeTruthy();
  await press('Remove');
  expect(await screen.findByText('Only the group’s owner can do that.')).toBeTruthy();
  expect(screen.getByText('Remove Jordan?')).toBeTruthy();
});

test('removed people are listed for the owner with Allow back', async () => {
  mockRemoved = { data: [{ user_id: 'sam', removed_at: '2026-11-11T18:00:00Z' }], error: null };
  await renderAs('maya');
  await screen.findByText('Removed');
  await press('Allow Removed member back');
  await press('Allow back');
  expect(mockCalls).toContainEqual(['allow_back', { group_id: 'g1', user_id: 'sam' }]);
});

test('a member leaves after confirming and goes back', async () => {
  const onBack = jest.fn();
  await renderAs('jordan', onBack);
  await screen.findByText('K7Q 2MX');
  await press('Leave Saturday crew');
  await press('Leave group');
  expect(mockCalls).toContainEqual(['leave_group', { group_id: 'g1' }]);
  expect(onBack).toHaveBeenCalled();
});

test('an empty roster shows that you are no longer in the group', async () => {
  mockRoster = { data: [], error: null };
  await renderAs('jordan');
  expect(await screen.findByText('You’re no longer in this group')).toBeTruthy();
});

test('an owner with other members must transfer before leaving; a sole owner archives', () => {
  expect(confirmCopy({ kind: 'leave', groupName: 'Crew', isOwner: true, others: 2 }).confirm).toBeUndefined();
  expect(confirmCopy({ kind: 'leave', groupName: 'Crew', isOwner: true, others: 0 }).confirm).toBe('Leave and archive');
  expect(confirmCopy({ kind: 'leave', groupName: 'Crew', isOwner: false, others: 3 }).confirm).toBe('Leave group');
});

test('server codes become plain messages; unknown errors ask to try again', async () => {
  mockRpc.leave_group = () => ({ data: null, error: { message: 'owner_must_transfer' } });
  await expect(leaveGroup('g1').catch(manageMessage)).resolves.toBe('Make someone else the owner before you leave.');
  mockRpc.remove_member = () => ({ data: null, error: { message: 'network down' } });
  await expect(removeMember('g1', 'u').catch(manageMessage)).resolves.toBe('Couldn’t finish. Try again.');
});
