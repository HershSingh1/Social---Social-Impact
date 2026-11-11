import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { JoinScreen } from '../JoinScreen';
import { cleanCode } from '../join';

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const mockRpc = jest.fn<Rpc>();
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args) } }));

const preview = (extra: object = {}) => ({ data: { ok: true, group_name: 'Saturday crew', owner_name: 'Maya', already_member: false, ...extra }, error: null });
const failed = (error: string) => ({ data: { ok: false, error }, error: null });
const typeCode = (text: string) => act(async () => { fireEvent.changeText(screen.getByLabelText('Group code'), text); });
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

beforeEach(() => { mockRpc.mockReset(); });

test('codes are uppercased and keep only the code alphabet, so a pasted "k7q 2mx" works', () => {
  expect(cleanCode('k7q 2mx')).toBe('K7Q2MX');
  expect(cleanCode('O0I1ab')).toBe('AB');
  expect(cleanCode('ABCDEFGH')).toBe('ABCDEF');
});

test('six characters show the preview, and Join opens the group', async () => {
  mockRpc.mockResolvedValueOnce(preview()).mockResolvedValueOnce({ data: { ok: true, group_id: 'g1', already_member: false }, error: null });
  const onJoined = jest.fn();
  await render(<JoinScreen onBack={() => {}} onJoined={onJoined} />);
  await typeCode('k7q2m');
  expect(mockRpc).not.toHaveBeenCalled();
  await typeCode('k7q2mx');
  expect(mockRpc).toHaveBeenCalledWith('preview_group_code', { code: 'K7Q2MX' });
  expect(screen.getByText('Created by Maya')).toBeTruthy();
  await tap('Join Saturday crew');
  expect(mockRpc).toHaveBeenLastCalledWith('join_group', { code: 'K7Q2MX' });
  expect(onJoined).toHaveBeenCalledWith('g1');
});

test('an existing member sees Open group and is taken to the group', async () => {
  mockRpc.mockResolvedValueOnce(preview({ already_member: true })).mockResolvedValueOnce({ data: { ok: true, group_id: 'g1', already_member: true }, error: null });
  const onJoined = jest.fn();
  await render(<JoinScreen initialCode="K7Q2MX" onBack={() => {}} onJoined={onJoined} />);
  expect(await screen.findByText('You’re already in this group.')).toBeTruthy();
  await tap('Open group');
  expect(onJoined).toHaveBeenCalledWith('g1');
});

test.each([
  ['wrong_code', 'That code doesn’t match a group.'],
  ['expired', 'This code has expired. Ask for a new one.'],
  ['too_many_tries', 'Too many tries, wait a minute.'],
])('%s shows the spec message and keeps the typed code', async (code, message) => {
  mockRpc.mockResolvedValueOnce(failed(code));
  await render(<JoinScreen onBack={() => {}} onJoined={() => {}} />);
  await typeCode('K7Q2MX');
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByLabelText('Group code').props.value).toBe('K7Q2MX');
  expect(screen.getByRole('button', { name: 'Join group' }).props.accessibilityState.disabled).toBe(true);
});

test('a join refused after the preview (group full) shows why and keeps the code', async () => {
  mockRpc.mockResolvedValueOnce(preview()).mockResolvedValueOnce(failed('group_full'));
  await render(<JoinScreen onBack={() => {}} onJoined={() => {}} />);
  await typeCode('K7Q2MX');
  await tap('Join Saturday crew');
  expect(screen.getByText('This group is full.')).toBeTruthy();
  expect(screen.getByLabelText('Group code').props.value).toBe('K7Q2MX');
});

test('a network error while checking says so, and the next edit checks again', async () => {
  mockRpc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(preview());
  await render(<JoinScreen onBack={() => {}} onJoined={() => {}} />);
  await typeCode('K7Q2MX');
  expect(screen.getByText('Couldn’t check the code. Try again.')).toBeTruthy();
  await typeCode('K7Q2M');
  await typeCode('K7Q2MX');
  expect(screen.getByText('Created by Maya')).toBeTruthy();
});
