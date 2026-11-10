import { fireEvent, render, screen } from '@testing-library/react-native';
import { FriendsScreen } from './FriendsScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockAuth: { isAccount: boolean };
let mockGroups: Record<string, unknown>;
let mockHub: { hub: unknown };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('./hooks', () => ({ useMyGroups: () => mockGroups }));
jest.mock('@/features/plans/useHub', () => ({ useHub: () => mockHub }));

const refetch = jest.fn();
const crew = { id: 'g1', name: 'Saturday crew', ownerId: 'u1', memberCount: 6, memberNames: ['Maya', 'Jordan', 'Sam', 'Priya'] };
const state = (o: object) => ({ data: undefined, isPending: false, isError: false, isRefetching: false, refetch, ...o });

beforeEach(() => { jest.clearAllMocks(); mockAuth = { isAccount: true }; mockGroups = state({ data: [crew] }); mockHub = { hub: null }; });

describe('Friends tab (P0-17)', () => {
  it('lists groups with the joined count', async () => {
    await render(<FriendsScreen />);
    expect(screen.getByText('Saturday crew')).toBeTruthy();
    expect(screen.getByText('6 joined')).toBeTruthy();
    expect(screen.getByText('No plan yet')).toBeTruthy();
  });

  it('opens a group', async () => {
    await render(<FriendsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Saturday crew, 6 joined/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/group/g1');
  });

  it('shows Loading, Empty and Error states', async () => {
    mockGroups = state({ isPending: true });
    const { rerender } = await render(<FriendsScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();

    mockGroups = state({ data: [] });
    await rerender(<FriendsScreen />);
    expect(screen.getByText('No groups yet')).toBeTruthy();

    mockGroups = state({ isError: true });
    await rerender(<FriendsScreen />);
    expect(screen.getByText("Couldn't load your groups.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps showing the groups when a refresh fails ("Try again keeps what was on screen")', async () => {
    mockGroups = state({ data: [crew], isError: true });
    await render(<FriendsScreen />);
    expect(screen.getByText('Saturday crew')).toBeTruthy();
    expect(screen.getByText(/Couldn't refresh/)).toBeTruthy();
  });

  it('a guest sees the banner, and Create group sends them to sign in then back to the sheet', async () => {
    mockAuth = { isAccount: false };
    await render(<FriendsScreen />);
    expect(screen.getByText("You're a guest on this device.")).toBeTruthy();
    expect(screen.getByText(/Sign in to keep your groups if you switch phones/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fcreate-group');
  });

  it('an account goes straight to the Create group sheet', async () => {
    await render(<FriendsScreen />);
    expect(screen.queryByText("You're a guest on this device.")).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/create-group');
  });

  it('Join with code opens the join screen', async () => {
    await render(<FriendsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Join with code' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/join');
  });

  it('shows the group\'s next plan, or its open pick, or "No plan yet"', async () => {
    const { buildHub } = require('@/features/plans/hub');
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const end = new Date(Date.now() + 3 * 86_400_000 + 5_400_000).toISOString();
    mockHub = { hub: buildHub([{ id: 'p', groupId: 'g1', groupName: 'Saturday crew', experienceName: 'Sketch and stroll', startAt: start, endAt: end, state: 'sent', status: 'going', isOrganizer: false }], []) };
    const { rerender } = await render(<FriendsScreen />);
    expect(screen.getByText(/^Sketch and stroll, /)).toBeTruthy();

    mockHub = { hub: buildHub([], [{ id: 'k', groupId: 'g1', groupName: 'Saturday crew', state: 'open', deadline: new Date(Date.now() + 86_400_000).toISOString(), voted: false, optionCount: 3, winnerName: null }]) };
    await rerender(<FriendsScreen />);
    expect(screen.getByText(/^Group pick open, closes /)).toBeTruthy();

    mockHub = { hub: buildHub([], []) };
    await rerender(<FriendsScreen />);
    expect(screen.getByText('No plan yet')).toBeTruthy();
  });
});
