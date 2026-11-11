import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CreateGroupSheet } from '../CreateGroupSheet';

const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>();
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockUuid}` }));


const created = { data: { group_id: 'g1', code: 'K7Q2MX', expires_at: '2026-11-25T00:00:00Z' }, error: null };
const typeName = (text: string) => fireEvent.changeText(screen.getByLabelText('Group name'), text);
const tapCreate = () => act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create group' })));

beforeEach(() => { mockRpc.mockReset(); mockUuid = 0; jest.mocked(Clipboard.setStringAsync).mockClear(); });

test('an empty name shows the error under the field and calls nothing', async () => {
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={() => {}} />);
  await tapCreate();
  expect(screen.getByText('Enter a group name.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a name over 50 characters is refused and stays in the field', async () => {
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={() => {}} />);
  await typeName('x'.repeat(51));
  await tapCreate();
  expect(screen.getByText('Use 50 characters or fewer.')).toBeTruthy();
  expect(screen.getByLabelText('Group name').props.value).toBe('x'.repeat(51));
  expect(mockRpc).not.toHaveBeenCalled();
});

test('creating sends a trimmed name with a client key, then shows the code with Copy and Share', async () => {
  mockRpc.mockResolvedValue(created);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  const onViewGroup = jest.fn();
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={onViewGroup} />);
  await typeName('  Saturday crew ');
  await tapCreate();
  expect(mockRpc).toHaveBeenCalledWith('create_group', { client_key: 'key-1', name: 'Saturday crew' });
  expect(screen.getByText('K7Q 2MX')).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Copy group code' })));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('K7Q2MX');
  expect(screen.getByText('Code copied.')).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Share group code' })));
  expect(share).toHaveBeenCalledWith({ message: 'Join Saturday crew on Sidequest with code K7Q2MX' });

  fireEvent.press(screen.getByRole('button', { name: 'View group' }));
  expect(onViewGroup).toHaveBeenCalledWith('g1');
});

test('a failed create keeps the name and a retry reuses the same client key', async () => {
  mockRpc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(created);
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={() => {}} />);
  await typeName('Saturday crew');
  await tapCreate();
  expect(screen.getByRole('alert').props.children).toMatch(/Couldn’t create the group/);
  expect(screen.getByLabelText('Group name').props.value).toBe('Saturday crew');
  await tapCreate();
  expect(mockRpc.mock.calls.map(call => call[1].client_key)).toEqual(['key-1', 'key-1']);
  expect(screen.getByText('K7Q 2MX')).toBeTruthy();
});

test('a different name after a failure is a new request with a new key', async () => {
  mockRpc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(created);
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={() => {}} />);
  await typeName('One');
  await tapCreate();
  await typeName('Two');
  await tapCreate();
  expect(mockRpc.mock.calls.map(call => call[1].client_key)).toEqual(['key-1', 'key-2']);
});

test('a second tap while the request is running does nothing', async () => {
  let finish!: (value: typeof created) => void;
  mockRpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={() => {}} />);
  await typeName('Saturday crew');
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Create group' }).props.accessibilityState.busy).toBe(true);
  await act(async () => finish(created));
});

test('the server rejecting the name shows under the field; the group limit shows under the button', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_group_name' } })
    .mockResolvedValueOnce({ data: null, error: { message: 'group_limit_reached' } });
  await render(<CreateGroupSheet visible onClose={() => {}} onViewGroup={() => {}} />);
  await typeName('Saturday crew');
  await tapCreate();
  expect(screen.getByText('Enter a group name of 1 to 50 characters.')).toBeTruthy();
  await tapCreate();
  expect(screen.getByText('You are in 20 groups already. Leave one to create another.')).toBeTruthy();
  expect(screen.getByLabelText('Group name').props.value).toBe('Saturday crew');
});
