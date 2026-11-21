import { beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { offerNotifications } from '../ask';
import { NotificationHost } from '../NotificationHost';
import { NotificationSettingsScreen } from '../NotificationSettingsScreen';
import { NudgePanel } from '../NudgePanel';
import { loadNudges, refusedMessage } from '../nudge';
import { unregisterPhone } from '../register';
import { routeFor } from '../route';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
let mockPrefs: { kind: string; enabled: boolean }[];
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
  from: () => ({ select: () => Promise.resolve({ data: mockPrefs, error: null }) }),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'proj' } } } } }));

type Perm = { granted: boolean; canAskAgain: boolean; status: string };
let mockPerm: Perm;
const mockRequest = jest.fn<() => Promise<Perm>>();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => mockPerm,
  requestPermissionsAsync: () => mockRequest(),
  getExpoPushTokenAsync: async () => ({ type: 'expo', data: 'ExponentPushToken[secret-token]' }),
  setNotificationHandler: () => undefined,
  useLastNotificationResponse: () => mockLast,
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));
let mockLast: unknown = null;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (p: string) => mockPush(p) } }));

const UNDETERMINED: Perm = { granted: false, canAskAgain: true, status: 'undetermined' };
const GRANTED: Perm = { granted: true, canAskAgain: true, status: 'granted' };
const DENIED: Perm = { granted: false, canAskAgain: false, status: 'denied' };
const PLAN = '6f1c2a40-8b1e-4d6a-9c3b-1a2b3c4d5e6f';
const PICK = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

async function wrap(ui: ReactNode) {
  return await render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockRequest.mockReset().mockResolvedValue(GRANTED);
  mockPerm = GRANTED; mockPrefs = []; mockLast = null; mockPush.mockReset();
});

test('a tapped notification opens its plan or pick, and anything else opens Home', () => {
  expect(routeFor({ kind: 'plan_sent', plan_id: PLAN })).toBe(`/plan/${PLAN}`);
  expect(routeFor({ kind: 'pick_result', pick_id: PICK })).toBe(`/pick/${PICK}`);
  expect(routeFor({ kind: 'organizer_nudge' })).toBe('/');
  expect(routeFor({ plan_id: '../../settings' })).toBe('/');
  expect(routeFor(null)).toBe('/');
});

test('settings shows seven switches, on unless the person turned one off, and saves a change', async () => {
  mockPrefs = [{ kind: 'pick_result', enabled: false }];
  await wrap(<NotificationSettingsScreen />);
  expect(await screen.findByLabelText('Plan sent to you')).toBeTruthy();
  expect(screen.getAllByRole('switch')).toHaveLength(7);
  expect(screen.getByLabelText('Pick result').props.value).toBe(false);
  expect(screen.getByLabelText('Pick opened').props.value).toBe(true);
  await fireEvent(screen.getByLabelText('Pick opened'), 'valueChange', false);
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('set_notification_pref', { kind: 'pick_opened', enabled: false }));
});

test('a switch that fails to save stays where it was and says so under the row', async () => {
  await wrap(<NotificationSettingsScreen />);
  await screen.findByLabelText('Plan cancelled');
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
  await fireEvent(screen.getByLabelText('Plan cancelled'), 'valueChange', false);
  expect(await screen.findByText('Couldn’t save. Try again.')).toBeTruthy();
  expect(screen.getByLabelText('Plan cancelled').props.value).toBe(true);
});

test('denied in iPhone Settings: the switches are read-only and a button opens iPhone Settings', async () => {
  mockPerm = DENIED;
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await wrap(<NotificationSettingsScreen />);
  expect(await screen.findByText(/Notifications are off for Sidequest/)).toBeTruthy();
  for (const s of screen.getAllByRole('switch')) expect(s.props.accessibilityState?.disabled ?? s.props.disabled).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Open iPhone Settings'));
  await waitFor(() => expect(open).toHaveBeenCalled());
});

test('not asked yet: the switches work, and Turn on notifications asks and registers this phone', async () => {
  mockPerm = UNDETERMINED;
  await wrap(<NotificationSettingsScreen />);
  await fireEvent.press(await screen.findByLabelText('Turn on notifications'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('register_push_token', { token: 'ExponentPushToken[secret-token]', platform: 'ios' }));
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('signing out removes this phone’s token, and a failure does not get in the way', async () => {
  await wrap(<NotificationSettingsScreen />);
  await AsyncStorage.setItem('sidequest.notifications.token', 'ExponentPushToken[secret-token]');
  await unregisterPhone();
  expect(mockRpc).toHaveBeenCalledWith('remove_push_token', { token: 'ExponentPushToken[secret-token]' });
  expect(await AsyncStorage.getItem('sidequest.notifications.token')).toBeNull();
  await AsyncStorage.setItem('sidequest.notifications.token', 'ExponentPushToken[again]');
  mockRpc.mockRejectedValueOnce(new Error('offline'));
  await expect(unregisterPhone()).resolves.toBeUndefined();
});

test('the ask appears once after the first join or send, never otherwise, and Not now does not ask the phone', async () => {
  mockPerm = UNDETERMINED;
  await render(<NotificationHost userId="u1" />);
  expect(screen.queryByText('Get a heads-up?')).toBeNull();
  await act(async () => offerNotifications());
  expect(await screen.findByText(/Sidequest can tell you when a plan is sent to you/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Not now'));
  expect(mockRequest).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('sidequest.notifications.offered.u1')).toBe('1');
  await act(async () => offerNotifications());
  await waitFor(() => expect(screen.queryByText(/Sidequest can tell you when a plan is sent to you/)).toBeNull());
});

test('the ask is skipped when the person already chose in iPhone Settings, and an allowed phone is registered quietly', async () => {
  mockPerm = GRANTED;
  await render(<NotificationHost userId="u2" />);
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('register_push_token', expect.anything()));
  await act(async () => offerNotifications());
  await waitFor(() => expect(AsyncStorage.getItem('sidequest.notifications.offered.u2')).resolves.toBe('1'));
  expect(screen.queryByText('Get a heads-up?')).toBeNull();
});

test('tapping a notification opens that plan once', async () => {
  mockLast = { actionIdentifier: 'default', notification: { request: { identifier: 'n1', content: { data: { kind: 'plan_sent', plan_id: PLAN } } } } };
  await render(<NotificationHost userId="u3" />);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/plan/${PLAN}`));
  expect(mockPush).toHaveBeenCalledTimes(1);
});

const SAM = { userId: 'sam', name: 'Sam' };
const PRIYA = { userId: 'priya', name: 'Priya' };

test('Nudge calls the server for that person and then reads Nudged just now', async () => {
  mockRpc.mockResolvedValueOnce({ data: ['sam'], error: null });
  await render(<NudgePanel planId={PLAN} organizerName="Maya" awaiting={[SAM, PRIYA]} />);
  expect(screen.getByText('Awaiting reply (2)')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nudge Sam'));
  await screen.findByText('Nudged just now');
  expect(mockRpc).toHaveBeenCalledWith('nudge', { plan_id: PLAN, user_ids: ['sam'] });
  expect(screen.getByLabelText('Nudge Priya')).toBeTruthy();
  expect(Object.keys(await loadNudges(PLAN))).toEqual(['sam']);
});

test('a person the server left out gets the 24-hour rule in words, not a false Nudged', async () => {
  mockRpc.mockResolvedValueOnce({ data: [], error: null });
  await render(<NudgePanel planId={PLAN} organizerName="Maya" awaiting={[PRIYA]} />);
  await fireEvent.press(screen.getByLabelText('Nudge Priya'));
  expect(await screen.findByText(/Priya wasn’t nudged. You can nudge each person once every 24 hours/)).toBeTruthy();
  expect(screen.queryByText(/Nudged/)).toBeNull();
});

test('a failed nudge shows an error under the person and can be tried again', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'plan_started' } });
  await render(<NudgePanel planId={PLAN} organizerName="Maya" awaiting={[SAM]} />);
  await fireEvent.press(screen.getByLabelText('Nudge Sam'));
  expect(await screen.findByText('Couldn’t send the nudge. Try again.')).toBeTruthy();
  expect(screen.getByLabelText('Nudge Sam')).toBeTruthy();
});

test('nobody awaiting: the card is not drawn', async () => {
  await render(<NudgePanel planId={PLAN} organizerName="Maya" awaiting={[]} />);
  expect(screen.queryByText(/Awaiting reply/)).toBeNull();
});

test('the refusal names the time the next nudge is allowed, in Austin time', () => {
  const at = '2026-11-21T20:40:00Z'; // 2:40 PM CST
  const message = refusedMessage('Priya', at, Date.parse(at) + 3_600_000);
  expect(message).toBe('You already nudged Priya in the last 24 hours. You can nudge again after 2:40 PM tomorrow.');
});
