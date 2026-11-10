import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthProvider';

const mockAuth = {
  getSession: jest.fn(),
  signInAnonymously: jest.fn(),
  onAuthStateChange: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@/shared/lib/supabase', () => ({ supabase: { get auth() { return mockAuth; } } }));
jest.mock('./api', () => ({ fetchProfile: jest.fn().mockResolvedValue(null) }));

const session = (id: string, anon: boolean) => ({ user: { id, is_anonymous: anon }, access_token: 't' });

function Probe() {
  const a = useAuth();
  return (
    <>
      <Text>{`status:${a.status} account:${a.isAccount} user:${a.userId ?? 'none'}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="retry" onPress={a.retry}><Text>retry</Text></Pressable>
    </>
  );
}
const mount = () => render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
});

describe('AuthProvider: every device gets a guest session', () => {
  it('creates an anonymous (guest) session on first launch', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuth.signInAnonymously.mockResolvedValue({ data: { session: session('guest-1', true) }, error: null });
    await mount();
    expect(await screen.findByText('status:ready account:false user:guest-1')).toBeTruthy();
    expect(mockAuth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('reuses a stored session (and does not create a second guest)', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: session('acct-1', false) } });
    await mount();
    expect(await screen.findByText('status:ready account:true user:acct-1')).toBeTruthy();
    expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('reports an error with a working retry when the guest session cannot be created', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuth.signInAnonymously.mockResolvedValueOnce({ data: { session: null }, error: { message: 'offline' } });
    await mount();
    expect(await screen.findByText(/status:error/)).toBeTruthy();

    mockAuth.signInAnonymously.mockResolvedValueOnce({ data: { session: session('guest-2', true) }, error: null });
    await fireEvent.press(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.getByText('status:ready account:false user:guest-2')).toBeTruthy());
  });

  it('an upgraded guest keeps the same user id and becomes an account', async () => {
    let listener: (event: string, s: unknown) => void = () => {};
    mockAuth.onAuthStateChange.mockImplementation((cb) => { listener = cb; return { data: { subscription: { unsubscribe: jest.fn() } } }; });
    mockAuth.getSession.mockResolvedValue({ data: { session: session('guest-1', true) } });
    await mount();
    await screen.findByText('status:ready account:false user:guest-1');
    await act(async () => listener('USER_UPDATED', session('guest-1', false)));
    expect(screen.getByText('status:ready account:true user:guest-1')).toBeTruthy();
  });
});
