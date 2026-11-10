import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JoinFlow } from './JoinFlow';
import { joinGroup, previewCode } from './api';
import { setProfile } from '@/features/auth/api';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
let mockAuth: { isAccount: boolean; profile: { display_name: string } | null; userId: string | null };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/auth/api', () => ({ setProfile: jest.fn() }));
jest.mock('./api', () => ({ previewCode: jest.fn(), joinGroup: jest.fn() }));

const preview = { ok: true as const, group_id: 'g1', group_name: 'Saturday crew', owner_name: 'Maya', already_member: false };

function renderFlow(initialCode?: string) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><JoinFlow initialCode={initialCode} /></QueryClientProvider>);
}
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const typeCode = (v: string) => fireEvent.changeText(screen.getByLabelText('Invite code'), v);

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { isAccount: false, profile: null, userId: 'u-guest' };
});

describe('JoinFlow (P0-01)', () => {
  it('shows the spec copy for a wrong code and keeps what was typed', async () => {
    (previewCode as jest.Mock).mockResolvedValue({ ok: false, error: 'wrong_code' });
    await renderFlow();
    await typeCode('zzzzzz');
    await press('Continue');
    expect(await screen.findByText(/That code doesn't match a group/)).toBeTruthy();
    expect(screen.getByLabelText('Invite code').props.value).toBe('ZZZZZZ');
  });

  it('shows the expired and too-many-tries messages', async () => {
    await renderFlow();
    await typeCode('SQ7K2M');
    (previewCode as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'expired' });
    await press('Continue');
    expect(await screen.findByText(/This code has expired. Ask for a new one./)).toBeTruthy();
    (previewCode as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'too_many_tries' });
    await press('Continue');
    expect(await screen.findByText(/Too many tries, wait a minute./)).toBeTruthy();
  });

  it('does not call the server for an incomplete code', async () => {
    await renderFlow();
    await typeCode('SQ7');
    await press('Continue');
    expect(await screen.findByText(/Codes have 6 characters/)).toBeTruthy();
    expect(previewCode).not.toHaveBeenCalled();
  });

  it('previews the group and owner without a member list, then joins as a guest with a display name', async () => {
    (previewCode as jest.Mock).mockResolvedValue(preview);
    (joinGroup as jest.Mock).mockResolvedValue({ ok: true, status: 'joined', group_id: 'g1', group_name: 'Saturday crew' });
    await renderFlow();
    await typeCode('sq7k2m');
    await press('Continue');
    expect(await screen.findByText('Saturday crew')).toBeTruthy();
    expect(screen.getByText(/Started by Maya/)).toBeTruthy();
    expect(previewCode).toHaveBeenCalledWith('SQ7K2M'); // case-insensitive: normalised
    expect(joinGroup).not.toHaveBeenCalled(); // previewing never adds anyone

    // no name: error under the field, nothing sent
    await press('Continue as guest');
    expect(await screen.findByText(/Add a name so friends know who you are/)).toBeTruthy();
    expect(joinGroup).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Your name'), '  Jordan ');
    await press('Continue as guest');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/group/g1'));
    expect(setProfile).toHaveBeenCalledWith('Jordan');
    expect(joinGroup).toHaveBeenCalledWith('SQ7K2M');
  });

  it('keeps the typed name when joining fails and says why', async () => {
    (previewCode as jest.Mock).mockResolvedValue(preview);
    (joinGroup as jest.Mock).mockResolvedValue({ ok: false, error: 'group_full' });
    await renderFlow('SQ7K2M');
    await fireEvent.changeText(await screen.findByLabelText('Your name'), 'Sam');
    await press('Continue as guest');
    expect(await screen.findByText(/This group is full/)).toBeTruthy();
    expect(screen.getByLabelText('Your name').props.value).toBe('Sam');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opening a link previews but never joins by itself', async () => {
    (previewCode as jest.Mock).mockResolvedValue(preview);
    await renderFlow('SQ7K2M');
    expect(await screen.findByText('Saturday crew')).toBeTruthy();
    expect(joinGroup).not.toHaveBeenCalled();
  });

  it('"Sign in instead" returns to this same invitation afterwards', async () => {
    (previewCode as jest.Mock).mockResolvedValue(preview);
    await renderFlow('SQ7K2M');
    await screen.findByText('Saturday crew');
    await press('Sign in instead');
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fjoin%2FSQ7K2M');
  });

  it('a signed-in person joins with their own name and no name field', async () => {
    mockAuth = { isAccount: true, profile: { display_name: 'Maya' }, userId: 'u-maya' };
    (previewCode as jest.Mock).mockResolvedValue(preview);
    (joinGroup as jest.Mock).mockResolvedValue({ ok: true, status: 'joined', group_id: 'g1', group_name: 'Saturday crew' });
    await renderFlow('SQ7K2M');
    await screen.findByText('Saturday crew');
    expect(screen.queryByLabelText('Your name')).toBeNull();
    await press('Join group');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/group/g1'));
    expect(setProfile).not.toHaveBeenCalled();
  });

  it('an existing member just opens the group (no second join)', async () => {
    (previewCode as jest.Mock).mockResolvedValue({ ...preview, already_member: true });
    await renderFlow('SQ7K2M');
    await screen.findByText('Saturday crew');
    await press('Open group');
    expect(mockRouter.replace).toHaveBeenCalledWith('/group/g1');
    expect(joinGroup).not.toHaveBeenCalled();
  });
});
