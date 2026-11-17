import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { myGroupsKey } from '../../groups/overview';
import { SavedIdeas } from '../../groups/SavedIdeas';
import { SaveSheet } from '../SaveSheet';
import { contextIds, groupIdeas, isSaved, saveErrorMessage, savedByLine, savesKey, type SaveRow } from '../saves';
import { EXPERIENCES_KEY } from '../useExperiences';

const mockRpc = jest.fn<(name: string, args: object) => Promise<{ data: unknown; error: unknown }>>();
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (name: string, args: object) => mockRpc(name, args),
  from: () => { throw new Error('offline'); },
} }));

const ME = 'me';
const rows: SaveRow[] = [
  { experience_id: 'a', user_id: ME, group_id: null },
  { experience_id: 'a', user_id: ME, group_id: 'g1' },
  { experience_id: 'a', user_id: 'maya', group_id: 'g1' },
  { experience_id: 'b', user_id: 'maya', group_id: 'g1' },
  { experience_id: 'c', user_id: 'maya', group_id: 'g2' },
];

test('a group library holds each experience once and lists everyone who saved it', () => {
  expect(groupIdeas(rows, 'g1')).toEqual([
    { experienceId: 'a', savers: [ME, 'maya'] },
    { experienceId: 'b', savers: ['maya'] },
  ]);
});

test('map contexts: Explore has no limit, My saves is personal only, a group shows its own saves', () => {
  expect(contextIds(rows, ME, { kind: 'explore' })).toBeNull();
  expect([...contextIds(rows, ME, { kind: 'mine' })!]).toEqual(['a']);
  expect([...contextIds(rows, ME, { kind: 'group', groupId: 'g1' })!].sort()).toEqual(['a', 'b']);
});

test('removing one save leaves the others: saved state is per destination', () => {
  const afterRemoving = rows.filter(r => !(r.group_id === 'g1' && r.user_id === ME));
  expect(isSaved(afterRemoving, ME, 'a', 'g1')).toBe(false);
  expect(isSaved(afterRemoving, ME, 'a', null)).toBe(true);
  expect(groupIdeas(afterRemoving, 'g1').find(i => i.experienceId === 'a')?.savers).toEqual(['maya']);
});

test('saved-by line puts you first and reads naturally', () => {
  const name = (id: string) => ({ maya: 'Maya', jo: 'Jordan' })[id as 'maya' | 'jo'];
  expect(savedByLine(['maya'], ME, name)).toBe('Saved by Maya');
  expect(savedByLine(['maya', ME], ME, name)).toBe('Saved by you and Maya');
  expect(savedByLine(['maya', 'jo', ME], ME, name)).toBe('Saved by you, Maya and Jordan');
});

test('save errors use plain words', () => {
  expect(saveErrorMessage(new Error('not_a_member'))).toBe('You’re no longer in this group.');
  expect(saveErrorMessage(new Error('network'))).toMatch(/Couldn’t save/);
});

const inset = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function clientWith(saved: SaveRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([...savesKey, ME], saved);
  client.setQueryData([...myGroupsKey, ME], [
    { id: 'g1', name: 'Saturday crew', memberCount: 2, faces: [], next: '' },
    { id: 'g2', name: 'Work friends', memberCount: 3, faces: [], next: '' },
  ]);
  client.setQueryData(EXPERIENCES_KEY, [{ id: 'a', name: 'Barton Springs Pool' }, { id: 'b', name: 'Clay and conversation' }]);
  return client;
}
const wrap = (client: QueryClient, ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={inset}><QueryClientProvider client={client}>{ui}</QueryClientProvider></SafeAreaProvider>);

beforeEach(() => { mockRpc.mockReset(); });

test('Save sheet shows a toggle per destination and confirms where a save went', async () => {
  mockRpc.mockResolvedValue({ data: true, error: null });
  await wrap(clientWith([{ experience_id: 'a', user_id: ME, group_id: null }]),
    <SaveSheet visible onClose={() => {}} experienceId="a" experienceName="Barton Springs Pool" userId={ME} />);
  expect(screen.getByRole('switch', { name: 'Save for me' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('switch', { name: 'Save to Saturday crew' }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole('switch', { name: 'Save to Work friends' })).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('switch', { name: 'Save to Saturday crew' })));
  expect(mockRpc).toHaveBeenCalledWith('set_save', { experience_id: 'a', group_id: 'g1', saved: true });
  expect(await screen.findByText('Saved to Saturday crew.')).toBeTruthy();
});

test('pressing a saved row asks for the unsaved state, so a retried request cannot flip it back', async () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  await wrap(clientWith([{ experience_id: 'a', user_id: ME, group_id: null }]),
    <SaveSheet visible onClose={() => {}} experienceId="a" experienceName="Barton Springs Pool" userId={ME} />);
  await act(async () => fireEvent.press(screen.getByRole('switch', { name: 'Save for me' })));
  expect(mockRpc).toHaveBeenCalledWith('set_save', { experience_id: 'a', group_id: null, saved: false });
  expect(await screen.findByText('Removed from My saves.')).toBeTruthy();
});

test('a failed save says so and does not claim it saved', async () => {
  mockRpc.mockResolvedValue({ data: null, error: new Error('not_a_member') });
  await wrap(clientWith([]), <SaveSheet visible onClose={() => {}} experienceId="a" experienceName="Barton" userId={ME} />);
  await act(async () => fireEvent.press(screen.getByRole('switch', { name: 'Save to Work friends' })));
  expect(await screen.findByText('You’re no longer in this group.')).toBeTruthy();
  expect(screen.queryByText(/^Saved to/)).toBeNull();
});

test('group Saved ideas lists each idea once, with who saved it', async () => {
  const client = clientWith(rows);
  client.setQueryData(['saver-names', 'g1', ['maya']], new Map([['maya', 'Maya']]));
  const open = jest.fn();
  await wrap(client, <SavedIdeas groupId="g1" userId={ME} onOpenExperience={open} />);
  expect(await screen.findByText('Saved by you and Maya')).toBeTruthy();
  expect(screen.getByText('Saved by Maya')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: /Clay and conversation/ })));
  expect(open).toHaveBeenCalledWith('b');
});

test('group Saved ideas has an empty state', async () => {
  await wrap(clientWith([]), <SavedIdeas groupId="g1" userId={ME} onOpenExperience={() => {}} />);
  expect(await screen.findByText('No saved ideas yet')).toBeTruthy();
});
