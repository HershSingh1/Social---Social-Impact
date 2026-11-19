import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthGate, linkToPath } from '../AuthGate';
import { AuthProvider } from '../AuthProvider';
import { EmailSignInScreen } from '../EmailSignInScreen';
import { ProfileSetupScreen } from '../ProfileSetupScreen';
import { UsernamePromptScreen } from '../UsernamePromptScreen';
import { SettingsScreen } from '../SettingsScreen';
import { WelcomeScreen } from '../WelcomeScreen';

type Result = { data?: unknown; error: { message: string; status?: number } | null };
type AuthListener = (event: string, session: unknown) => void;
const mockAuth = {
  getSession: jest.fn<() => Promise<{ data: { session: unknown } }>>(),
  getUser: jest.fn<() => Promise<{ data: { user: { id: string } | null }; error: Error | null }>>(),
  onAuthStateChange: jest.fn((listener: AuthListener) => { mockListener = listener; return { data: { subscription: { unsubscribe: () => {} } } }; }),
  signInWithOtp: jest.fn<(args: unknown) => Promise<Result>>(),
  verifyOtp: jest.fn<(args: unknown) => Promise<Result>>(),
  signOut: jest.fn<(args: unknown) => Promise<Result>>(),
};
let mockListener: AuthListener = () => {};
const mockProfile = jest.fn<() => Promise<Result>>();
const mockRpc = jest.fn<(fn: string, args: unknown) => Promise<Result>>();
jest.mock('../../../lib/supabase', () => ({ supabase: {
  get auth() { return mockAuth; },
  rpc: (fn: string, args: unknown) => mockRpc(fn, args),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockProfile(), single: () => mockProfile() }) }) }),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (path: string) => mockPush(path), back: jest.fn() } }));
const mockCalendarRequest = jest.fn<() => Promise<{ granted: boolean }>>();
jest.mock('expo-calendar', () => ({ requestCalendarPermissions: () => mockCalendarRequest() }));
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
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});

const settings = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <SettingsScreen />
</QueryClientProvider>);

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

test('a plan link opened signed out is kept, so it opens after sign-in (D1)', () => {
  expect(linkToPath('sidequest://plan-link/abc123')).toBe('/plan-link/abc123');
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

const fillProfile = async (over: Partial<Record<'Full name' | 'Username' | 'Age' | 'City', string>> = {}) => {
  const values = { 'Full name': 'Maya', Username: 'maya_k', Age: '', City: '', ...over };
  for (const [label, text] of Object.entries(values)) await typeInto(label, text);
};

test('profile setup: an age out of range shows under the field and nothing is cleared', async () => {
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await fillProfile({ City: 'Austin, TX', Age: '12' });
  await tap('Continue');
  expect(screen.getByText('Enter an age from 13 to 120.')).toBeTruthy();
  expect(screen.getByLabelText('Full name').props.value).toBe('Maya');
  expect(screen.getByLabelText('City').props.value).toBe('Austin, TX');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('profile setup needs a username of 3 to 20 letters, numbers or underscores', async () => {
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await fillProfile({ Username: '' });
  await tap('Continue');
  expect(screen.getByText('Choose a username.')).toBeTruthy();
  await typeInto('Username', 'a b');
  await tap('Continue');
  expect(screen.getByText('Use 3 to 20 letters, numbers or underscores.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('profile setup saves name, username, city and age through set_profile, then shows step 2', async () => {
  mockRpc.mockResolvedValue({ error: null });
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await fillProfile({ 'Full name': '  Maya ', Username: '@Maya_K', Age: '24' });
  await tap('Continue');
  expect(mockRpc).toHaveBeenCalledWith('set_profile', { display_name: 'Maya', avatar_path: null, city: null, age: 24, username: 'Maya_K' });
  expect(await screen.findByText('What are you into?')).toBeTruthy();
});

test('a taken username shows under the field and keeps everything typed', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'username_taken' } });
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await fillProfile({ City: 'Austin, TX', Age: '24' });
  await tap('Continue');
  expect(screen.getByText('That username is taken. Try another.')).toBeTruthy();
  expect(screen.getByLabelText('Username').props.value).toBe('maya_k');
  expect(screen.getByLabelText('City').props.value).toBe('Austin, TX');
  expect(screen.queryByText('What are you into?')).toBeNull();
});

async function reachInterests() {
  mockRpc.mockResolvedValue({ error: null });
  await render(<AuthProvider><ProfileSetupScreen /></AuthProvider>);
  await fillProfile();
  await tap('Continue');
  await screen.findByText('What are you into?');
}
const chip = (name: string) => act(async () => fireEvent.press(screen.getByRole('checkbox', { name })));

test('interests: Continue waits for 3, then saves them as yes with the spend through set_profile_defaults', async () => {
  await reachInterests();
  mockRpc.mockClear();
  await chip('Brunch');
  await chip('Hiking');
  expect(screen.getByRole('button', { name: 'Continue · 2 selected' }).props.accessibilityState.disabled).toBe(true);
  await chip('Film');
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: '$$, Under $50' })));
  await tap('Continue · 3 selected');
  expect(mockRpc).toHaveBeenNthCalledWith(1, 'set_interests', { answers: { brunch: 'yes', hiking: 'yes', film: 'yes' } });
  expect(mockRpc).toHaveBeenNthCalledWith(2, 'set_profile_defaults', { budget_cap: 50 });
  expect(await screen.findByText('Connect your calendar')).toBeTruthy();
});

test('interests can be skipped without saving anything', async () => {
  await reachInterests();
  mockRpc.mockClear();
  await tap('Skip');
  expect(await screen.findByText('Connect your calendar')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a failed save keeps the picks and shows Try again text under the button', async () => {
  await reachInterests();
  mockRpc.mockResolvedValue({ error: { message: 'offline' } });
  await chip('Brunch'); await chip('Hiking'); await chip('Film');
  await tap('Continue · 3 selected');
  expect(screen.getByText(/Couldn’t save your answers/)).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Film' }).props.accessibilityState.checked).toBe(true);
});

test('calendar step: nothing is requested until Connect is tapped, and a denial still lets setup finish', async () => {
  await reachInterests();
  await tap('Skip');
  expect(mockCalendarRequest).not.toHaveBeenCalled();
  mockCalendarRequest.mockResolvedValue({ granted: false });
  await tap('Connect Apple Calendar');
  expect(mockCalendarRequest).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Calendar access wasn’t allowed/)).toBeTruthy();
  await tap('Skip for now');
  expect(await AsyncStorage.getItem('sidequest.onboarding.u1')).toBeNull();
});

test('calendar step: granting shows Connected', async () => {
  await reachInterests();
  await tap('Skip');
  mockCalendarRequest.mockResolvedValue({ granted: true });
  await tap('Connect Google Calendar');
  expect(screen.getAllByText('Connected')).toHaveLength(2);
});

test('reopening resumes at the first unfinished step; people with a name and no marker are done', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session } });
  await AsyncStorage.setItem('sidequest.onboarding.u1', '2');
  mockProfile.mockResolvedValue({ data: { display_name: 'Maya', username: 'maya_k' }, error: null });
  await gate();
  expect(await screen.findByText('needs-profile')).toBeTruthy();
  await AsyncStorage.clear();
  await gate();
  expect(await screen.findAllByText('ready')).toBeTruthy();
});

test('finishing the last step opens the app', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session } });
  await AsyncStorage.setItem('sidequest.onboarding.u1', '3');
  mockProfile.mockResolvedValue({ data: { display_name: 'Maya', username: 'maya_k' }, error: null });
  await render(<AuthProvider><AuthGate>{status => status === 'ready' ? <Text>app</Text> : <ProfileSetupScreen />}</AuthGate></AuthProvider>);
  await screen.findByText('Connect your calendar');
  await tap('Finish setup');
  expect(await screen.findByText('app')).toBeTruthy();
  expect(await AsyncStorage.getItem('sidequest.onboarding.u1')).toBeNull();
});

test('someone from before usernames is asked once with a modal, and saving keeps their city and age', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session } });
  mockProfile.mockResolvedValue({ data: { display_name: 'Maya', username: null }, error: null });
  await gate();
  expect(await screen.findAllByText('ready')).toBeTruthy();
  await act(async () => {});
  expect(mockPush).toHaveBeenCalledWith('/username');
  await gate();
  await act(async () => {});
  expect(mockPush).toHaveBeenCalledTimes(1);

  mockProfile.mockResolvedValue({ data: { display_name: 'Maya', avatar_path: null, city: 'Austin, TX', age: 30 }, error: null });
  mockRpc.mockResolvedValue({ error: null });
  await render(<AuthProvider><UsernamePromptScreen /></AuthProvider>);
  await typeInto('Username', 'maya_k');
  await tap('Save username');
  expect(mockRpc).toHaveBeenCalledWith('set_profile', { display_name: 'Maya', avatar_path: null, city: 'Austin, TX', age: 30, username: 'maya_k' });
});

test('settings opens the private preferences', async () => {
  mockProfile.mockResolvedValue({ data: { display_name: 'Maya', avatar_path: null }, error: null });
  await settings();
  await tap('Edit preferences');
  expect(mockPush).toHaveBeenCalledWith('/preferences');
});

test('settings signs out locally', async () => {
  mockAuth.signOut.mockResolvedValue({ error: null });
  await settings();
  await tap('Sign out');
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('a signed-out auth event returns the gate to welcome', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session } });
  mockProfile.mockResolvedValue({ data: { display_name: 'Maya' }, error: null });
  await gate();
  expect(await screen.findByText('ready')).toBeTruthy();
  await act(async () => mockListener('SIGNED_OUT', null));
  expect(await screen.findByText('signed-out')).toBeTruthy();
});

test('delete account names what is deleted, confirms, then clears the local session', async () => {
  mockRpc.mockResolvedValue({ error: null });
  mockAuth.signOut.mockResolvedValue({ error: null });
  await settings();
  await tap('Delete account');
  expect(screen.getByText(/profile, saves, votes, responses, and group memberships/)).toBeTruthy();
  expect(screen.getByText(/Plans you organized will be cancelled/)).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
  await tap('Delete my account');
  expect(mockRpc).toHaveBeenCalledWith('delete_account', undefined);
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('delete account can be cancelled without changing anything', async () => {
  await settings();
  await tap('Delete account');
  await tap('Keep my account');
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('welcome offers Google and email code, no Apple, and keeps the join code request through sign-in', async () => {
  const onEmail = jest.fn();
  await render(<WelcomeScreen onEmail={onEmail} />);
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue with email' })).toBeTruthy();
  expect(screen.queryByText(/Apple/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Join a group with a code' })));
  expect(await AsyncStorage.getItem('sidequest.pendingLink')).toBe('/join');
  expect(onEmail).toHaveBeenCalled();
});
