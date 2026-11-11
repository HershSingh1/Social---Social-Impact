import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthGate, linkToPath } from '../AuthGate';
import { AuthProvider } from '../AuthProvider';
import { EmailSignInScreen } from '../EmailSignInScreen';
import { ProfileSetupScreen } from '../ProfileSetupScreen';

type Result = { data?: unknown; error: { message: string; status?: number } | null };
type AuthListener = (event: string, session: unknown) => void;
const mockAuth = {
  getSession: jest.fn<() => Promise<{ data: { session: unknown } }>>(),
  onAuthStateChange: jest.fn((listener: AuthListener) => { mockListener = listener; return { data: { subscription: { unsubscribe: () => {} } } }; }),
  signInWithOtp: jest.fn<(args: unknown) => Promise<Result>>(),
  verifyOtp: jest.fn<(args: unknown) => Promise<Result>>(),
};
let mockListener: AuthListener = () => {};
const mockProfile = jest.fn<() => Promise<Result>>();
const mockRpc = jest.fn<(fn: string, args: unknown) => Promise<Result>>();
jest.mock('../../../lib/supabase', () => ({ supabase: {
  get auth() { return mockAuth; },
  rpc: (fn: string, args: unknown) => mockRpc(fn, args),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockProfile() }) }) }),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (path: string) => mockPush(path) } }));
let mockUrl: string | null = null;
jest.mock('expo-linking', () => ({
  useLinkingURL: () => mockUrl,
  parse: (url: string) => {
    const parsed = new URL(url.replace('sidequest://', 'https://x/'));
    return { path: parsed.pathname.slice(1), queryParams: Object.fromEntries(parsed.searchParams) };
  },
}));

const session = { user: { id: 'u1' } };
const gate = () => render(<AuthProvider><AuthGate>{status => <Text>{status}</Text>}</AuthGate></AuthProvider>);

beforeEach(async () => {
  jest.clearAllMocks();
  mockUrl = null;
  await AsyncStorage.clear();
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
});

test('no session → signed out, so only the welcome and sign-in screens are open', async () => {
  await gate();
  expect(await screen.findByText('signed-out')).toBeTruthy();
});

test('a session without a name → profile setup; with a name → the app', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session } });
  mockProfile.mockResolvedValueOnce({ data: { display_name: null }, error: null });
  await gate();
  expect(await screen.findByText('needs-profile')).toBeTruthy();

  mockProfile.mockResolvedValueOnce({ data: { display_name: 'Maya' }, error: null });
  await gate();
  expect(await screen.findByText('ready')).toBeTruthy();
});

test('a failed profile check shows Try again, and retrying recovers', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session } });
  mockProfile.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    .mockResolvedValueOnce({ data: { display_name: 'Maya' }, error: null });
  await gate();
  expect(await screen.findByText(/Couldn’t load your account/)).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
  expect(await screen.findByText('ready')).toBeTruthy();
});

test('a join link opened signed out is kept and opened after sign-in', async () => {
  mockUrl = 'sidequest://join?code=K7Q2MX';
  await gate();
  await screen.findByText('signed-out');
  expect(await AsyncStorage.getItem('sidequest.pendingLink')).toBe('/join?code=K7Q2MX');

  mockProfile.mockResolvedValue({ data: { display_name: 'Jordan' }, error: null });
  await act(async () => mockListener('SIGNED_IN', session));
  expect(await screen.findByText('ready')).toBeTruthy();
  expect(mockPush).toHaveBeenCalledWith('/join?code=K7Q2MX');
  expect(await AsyncStorage.getItem('sidequest.pendingLink')).toBeNull();
});

test('links to the auth screens and the home link are not kept', () => {
  expect(linkToPath('sidequest://')).toBeNull();
  expect(linkToPath('sidequest://auth/callback?code=abc')).toBeNull();
  expect(linkToPath('sidequest://groups/g1')).toBe('/groups/g1');
});

const typeInto = (label: string, text: string) => act(async () => { fireEvent.changeText(screen.getByLabelText(label), text); });
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

async function reachCodeStep() {
  mockAuth.signInWithOtp.mockResolvedValue({ error: null });
  await render(<EmailSignInScreen onBack={() => {}} />);
  await typeInto('Email', 'maya@example.com');
  await tap('Send code');
}

test('a bad email shows the error under the field and keeps what was typed', async () => {
  await render(<EmailSignInScreen onBack={() => {}} />);
  await typeInto('Email', 'maya@');
  await tap('Send code');
  expect(screen.getByText('Enter an email address like name@example.com.')).toBeTruthy();
  expect(screen.getByLabelText('Email').props.value).toBe('maya@');
  expect(mockAuth.signInWithOtp).not.toHaveBeenCalled();
});

test('five wrong codes lock Verify until a new code is sent', async () => {
  await reachCodeStep();
  mockAuth.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid', status: 403 } });
  for (let i = 0; i < 4; i++) {
    await typeInto('6-digit code', '123456');
    await tap('Verify');
    expect(screen.getByText('That code is wrong or has expired.')).toBeTruthy();
    expect(screen.getByLabelText('6-digit code').props.value).toBe('123456');
  }
  await tap('Verify');
  expect(screen.getByText('Too many tries. Send a new code.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Verify' }).props.accessibilityState.disabled).toBe(true);
  expect(mockAuth.verifyOtp).toHaveBeenCalledTimes(5);

  await tap('Send a new code');
  expect(screen.getByRole('button', { name: 'Verify' }).props.accessibilityState.disabled).toBe(false);
});

test('a dropped connection while verifying is not counted as a wrong try', async () => {
  await reachCodeStep();
  mockAuth.verifyOtp.mockRejectedValue(new Error('Network request failed'));
  await typeInto('6-digit code', '123456');
  await tap('Verify');
  expect(screen.getByText('Couldn’t check the code. Try again.')).toBeTruthy();
  expect(screen.queryByText('That code is wrong or has expired.')).toBeNull();
});

test('profile setup: an age out of range shows under the field and nothing is cleared', async () => {
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await typeInto('Name', 'Maya');
  await typeInto('City (optional)', 'Austin, TX');
  await typeInto('Age (optional)', '12');
  await tap('Continue');
  expect(screen.getByText('Enter an age from 13 to 120.')).toBeTruthy();
  expect(screen.getByLabelText('Name').props.value).toBe('Maya');
  expect(screen.getByLabelText('City (optional)').props.value).toBe('Austin, TX');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('profile setup saves name, city and age through set_profile', async () => {
  mockRpc.mockResolvedValue({ error: null });
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await typeInto('Name', '  Maya ');
  await typeInto('Age (optional)', '24');
  await tap('Continue');
  expect(mockRpc).toHaveBeenCalledWith('set_profile', { display_name: 'Maya', avatar_path: null, city: null, age: 24 });
});
