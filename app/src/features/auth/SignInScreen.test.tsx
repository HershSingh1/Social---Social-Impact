import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInScreen } from './SignInScreen';
import * as api from './api';

const mockRouter = { replace: jest.fn() };
let mockParams: { returnTo?: string };
const mockLoadProfile = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 2 },
}));
jest.mock('./AuthProvider', () => ({ useAuth: () => ({ userId: 'u-guest', loadProfile: mockLoadProfile }) }));
jest.mock('./api', () => ({
  isAppleSignInAvailable: jest.fn().mockResolvedValue(false),
  signInWithApple: jest.fn(), switchToExistingApple: jest.fn(), guestHasActivity: jest.fn(),
  startEmailUpgrade: jest.fn(), sendExistingAccountCode: jest.fn(), verifyEmailCode: jest.fn(),
  setProfile: jest.fn(),
}));

const a = api as jest.Mocked<typeof api>;
const renderIt = () => render(<QueryClientProvider client={new QueryClient()}><SignInScreen /></QueryClientProvider>);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

async function toCodeStep() {
  await press('Email me a code');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');
  await press('Send code');
  await screen.findByLabelText('Code from your email');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { returnTo: '/create-group' };
  a.verifyEmailCode.mockResolvedValue(undefined); // earlier tests may have made it reject
  mockLoadProfile.mockResolvedValue({ id: 'u-guest', display_name: 'Maya' });
});

describe('Sign in (P0-02)', () => {
  it('rejects a bad email under the field and keeps the text', async () => {
    await renderIt();
    await press('Email me a code');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@');
    await press('Send code');
    expect(await screen.findByText(/Enter an email like name@example.com/)).toBeTruthy();
    expect(screen.getByLabelText('Email').props.value).toBe('maya@');
    expect(a.startEmailUpgrade).not.toHaveBeenCalled();
  });

  it('email code upgrades the guest and returns to the exact step (Create group sheet)', async () => {
    a.startEmailUpgrade.mockResolvedValue({ mode: 'upgrade' });
    await renderIt();
    await toCodeStep();
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '482 913');
    await press('Verify and continue');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/create-group'));
    expect(a.verifyEmailCode).toHaveBeenCalledWith('maya@example.com', '482913', 'upgrade');
  });

  it('a wrong code shows a message and keeps the digits; five misses stop further tries', async () => {
    a.startEmailUpgrade.mockResolvedValue({ mode: 'upgrade' });
    a.verifyEmailCode.mockRejectedValue({ code: 'otp_expired' });
    await renderIt();
    await toCodeStep();
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '111111');
    for (let i = 0; i < 5; i++) await press('Verify and continue');
    expect(await screen.findByText(/wrong or has expired/)).toBeTruthy();
    expect(screen.getByLabelText('Code from your email').props.value).toBe('111111');
    await press('Verify and continue');
    expect(await screen.findByText(/Too many tries. Send a new code./)).toBeTruthy();
    expect(a.verifyEmailCode).toHaveBeenCalledTimes(5);
  });

  it('asks for a display name when the account has none, then returns', async () => {
    a.startEmailUpgrade.mockResolvedValue({ mode: 'upgrade' });
    mockLoadProfile.mockResolvedValue(null);
    await renderIt();
    await toCodeStep();
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '482913');
    await press('Verify and continue');
    expect(await screen.findByText('What should we call you?')).toBeTruthy();
    await press('Continue');
    expect(await screen.findByText(/Add a name so friends know who you are/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Your name'), 'Maya');
    await press('Continue');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/create-group'));
    expect(a.setProfile).toHaveBeenCalledWith('Maya');
  });

  it('an email that already has an account: guest with groups is asked first', async () => {
    a.startEmailUpgrade.mockResolvedValue({ mode: 'exists' });
    a.guestHasActivity.mockResolvedValue(true);
    await renderIt();
    await press('Email me a code');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');
    await press('Send code');
    expect(await screen.findByText('This sign-in already has an account')).toBeTruthy();
    expect(a.sendExistingAccountCode).not.toHaveBeenCalled();
    await press('Sign in to that account');
    await screen.findByLabelText('Code from your email');
    expect(a.sendExistingAccountCode).toHaveBeenCalledWith('maya@example.com');
  });

  it('an email that already has an account: a guest with nothing to lose just switches', async () => {
    a.startEmailUpgrade.mockResolvedValue({ mode: 'exists' });
    a.guestHasActivity.mockResolvedValue(false);
    await renderIt();
    await press('Email me a code');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');
    await press('Send code');
    await screen.findByLabelText('Code from your email');
    expect(a.sendExistingAccountCode).toHaveBeenCalled();
    expect(screen.queryByText('This sign-in already has an account')).toBeNull();
  });

  it('refuses to return anywhere outside the app', async () => {
    mockParams = { returnTo: 'https://evil.example' };
    a.startEmailUpgrade.mockResolvedValue({ mode: 'upgrade' });
    await renderIt();
    await toCodeStep();
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '482913');
    await press('Verify and continue');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });
});
