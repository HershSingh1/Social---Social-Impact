import { fireEvent, render, screen } from '@testing-library/react-native';
import { PlansHubScreen } from './PlansHubScreen';
import { buildHub, type HubPick, type HubPlan } from './hub';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
let mockAuth: { isAccount: boolean };
let mockHubResult: { query: Record<string, unknown>; hub: ReturnType<typeof buildHub> | null };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('./useHub', () => ({ useHub: () => mockHubResult }));

const day = 86_400_000;
const at = (d: number, h = 20) => new Date(Date.now() + d * day + (h - new Date().getUTCHours()) * 3_600_000).toISOString();
const plan = (id: string, over: Partial<HubPlan> = {}): HubPlan => ({
  id, groupId: 'g1', groupName: 'Saturday crew', experienceName: `Plan ${id}`, startAt: at(3), endAt: new Date(new Date(at(3)).getTime() + 5_400_000).toISOString(),
  state: 'sent', status: 'going', isOrganizer: false, ...over,
});
const pick = (id: string, over: Partial<HubPick> = {}): HubPick => ({
  id, groupId: 'g1', groupName: 'Saturday crew', state: 'open', deadline: at(1), voted: false, optionCount: 3, winnerName: null, ...over,
});
const ok = (plans: HubPlan[], picks: HubPick[]) => ({ query: { isPending: false, isError: false, isRefetching: false, refetch: jest.fn() }, hub: buildHub(plans, picks) });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => { jest.resetAllMocks(); mockAuth = { isAccount: true }; mockHubResult = ok([], []); });

describe('Plans hub (P0-16)', () => {
  it('lists Needs your response, Open group picks and Upcoming, in that order, with status in words', async () => {
    mockHubResult = ok(
      [plan('up', { status: 'going' }), plan('need', { status: 'awaiting' }), plan('re', { status: 'needs_reconfirm' })],
      [pick('p1'), pick('p2', { voted: true })],
    );
    await render(<PlansHubScreen />);
    const headers = screen.getAllByRole('header').map((h) => h.props.children);
    expect(headers.filter((h: unknown) => ['Needs your response', 'Open group picks', 'Upcoming'].includes(h as string))).toEqual(['Needs your response', 'Open group picks', 'Upcoming']);
    expect(screen.getByText('Needs reconfirmation')).toBeTruthy();
    expect(screen.getByText('Awaiting your response')).toBeTruthy();
    expect(screen.getByText('Vote needed')).toBeTruthy();
    expect(screen.getByText('You voted')).toBeTruthy();
    expect(screen.getByText('Going')).toBeTruthy();
    // Needs reconfirmation comes before Awaiting
    const order = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string).filter((l) => l?.startsWith('Plan '));
    expect(order.map((l) => l.split(',')[0])).toEqual(['Plan re', 'Plan need', 'Plan up']);
  });

  it('a cancelled plan stays visible with a Cancelled label', async () => {
    mockHubResult = ok([plan('x', { state: 'cancelled' })], []);
    await render(<PlansHubScreen />);
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  it('opens a plan and a pick', async () => {
    mockHubResult = ok([plan('abc', { status: 'awaiting' })], [pick('pk')]);
    await render(<PlansHubScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /^Plan abc/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/plan/abc');
    await fireEvent.press(screen.getByRole('button', { name: /^Group pick/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/pk');
  });

  it('says "all caught up" when only upcoming plans remain', async () => {
    mockHubResult = ok([plan('a', { status: 'going' })], []);
    await render(<PlansHubScreen />);
    expect(screen.getByText("You're all caught up.")).toBeTruthy();
  });

  it('empty: "No plans yet" with Find something to do (opens the map)', async () => {
    await render(<PlansHubScreen />);
    expect(screen.getByText('No plans yet')).toBeTruthy();
    await press('Find something to do');
    expect(mockRouter.navigate).toHaveBeenCalledWith('/');
  });

  it('Start a group pick: an account goes to the builder, a guest signs in and returns there', async () => {
    const { rerender } = await render(<PlansHubScreen />);
    await press('Start a group pick');
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/new');
    mockAuth = { isAccount: false };
    await rerender(<PlansHubScreen />);
    await press('Start a group pick');
    expect(mockRouter.push).toHaveBeenLastCalledWith('/sign-in?returnTo=%2Fpick%2Fnew');
  });

  it('Loading, Error with retry, and a stale banner that keeps the plans on screen', async () => {
    mockHubResult = { query: { isPending: true, isError: false, isRefetching: false, refetch: jest.fn() }, hub: null };
    const { rerender } = await render(<PlansHubScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();

    const refetch = jest.fn();
    mockHubResult = { query: { isPending: false, isError: true, isRefetching: false, refetch }, hub: null };
    await rerender(<PlansHubScreen />);
    expect(screen.getByText("Couldn't load your plans.")).toBeTruthy();
    await press('Try again');
    expect(refetch).toHaveBeenCalled();

    mockHubResult = { query: { isPending: false, isError: true, isRefetching: false, refetch }, hub: buildHub([plan('a', { status: 'awaiting' })], []) };
    await rerender(<PlansHubScreen />);
    expect(screen.getByText(/Couldn't refresh/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Plan a/ })).toBeTruthy();
  });
});
