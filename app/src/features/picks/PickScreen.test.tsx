import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PickScreen } from './PickScreen';
import { cancelPick, castVote, closePick, overridePick } from './api';
import { detail, TIE_SENTENCE, WORKED_TALLIES } from './testData';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockAuth: { userId: string };
let mockQuery: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('./hooks', () => ({ usePickDetail: () => mockQuery }));
jest.mock('./api', () => ({ castVote: jest.fn(), closePick: jest.fn(), cancelPick: jest.fn(), overridePick: jest.fn() }));

const ready = (data: unknown) => ({ data, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() });
const renderIt = () => render(<QueryClientProvider client={new QueryClient()}><PickScreen pickId="p1" /></QueryClientProvider>);
const press = (name: string | RegExp, role = 'button') => fireEvent.press(screen.getByRole(role as 'button', { name }));

beforeEach(() => { jest.resetAllMocks(); mockAuth = { userId: 'jordan' }; mockQuery = ready(detail()); });

describe('open pick (P0-08)', () => {
  it('shows the question, the clock, "X of Y voted", every option and the tie-breaker rule', async () => {
    mockQuery = ready(detail({ voters: [{ user_id: 'maya', complete: true }, { user_id: 'sam', complete: true }] }));
    await renderIt();
    expect(screen.getByText('What should we do this weekend?')).toBeTruthy();
    expect(screen.getByText('Started by Maya. 3 options.')).toBeTruthy();
    expect(screen.getByText(/Closes .* \(Austin time\)/)).toBeTruthy();
    expect(screen.getAllByText('2 of 6')).toHaveLength(2); // clock card and the who-has-voted header
    for (const n of ['Sketch and stroll', 'Clay and conversation', 'Barton Springs swim']) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.getByText(/If points tie, fewer No votes wins, then Maya's starred option, then the option added first/)).toBeTruthy();
    expect(screen.getAllByText('Booking required. Going here does not reserve a spot.')).toHaveLength(1);
  });

  it('lists who has voted by name, never how they voted', async () => {
    mockQuery = ready(detail({ voters: [{ user_id: 'maya', complete: true }] }));
    await renderIt();
    expect(screen.getByText('Voted: Maya')).toBeTruthy();
    expect(screen.getByText('Not yet: Jordan (you)')).toBeTruthy();
    expect(screen.getByText('You can see who has voted, not how they voted.')).toBeTruthy();
  });

  it('shows the live tallies and points', async () => {
    mockQuery = ready(detail({ tallies: WORKED_TALLIES }));
    await renderIt();
    expect(screen.getByLabelText('3 yes, 2 maybe, 1 no, 8 points')).toBeTruthy();
    expect(screen.getByLabelText('1 yes, 3 maybe, 2 no, 5 points')).toBeTruthy();
  });

  it('a vote is sent, shown as selected right away, and tapping it again clears it', async () => {
    await renderIt();
    const sketchGroup = screen.getByLabelText('Your vote for Sketch and stroll');
    expect(sketchGroup).toBeTruthy();
    const yes = screen.getAllByRole('radio', { name: 'Yes' })[0];
    await fireEvent.press(yes);
    expect(castVote).toHaveBeenCalledWith('sketch', 'yes');

    mockQuery = ready(detail({ myVotes: { sketch: 'yes' } }));
  });

  it('tapping the selected vote sends NULL to clear it', async () => {
    mockQuery = ready(detail({ myVotes: { sketch: 'maybe' } }));
    await renderIt();
    await fireEvent.press(screen.getByRole('radio', { name: 'Maybe, your vote. Tap again to clear' }));
    expect(castVote).toHaveBeenCalledWith('sketch', null);
  });

  it('says why a vote failed and offers Retry', async () => {
    (castVote as jest.Mock).mockRejectedValueOnce({ message: 'network' }).mockRejectedValueOnce(new TypeError('Network request failed'));
    await renderIt();
    await fireEvent.press(screen.getAllByRole('radio', { name: 'No' })[0]);
    expect(await screen.findByText(/No connection/)).toBeTruthy();
    (castVote as jest.Mock).mockResolvedValueOnce(undefined);
    await press('Retry');
    await waitFor(() => expect(castVote).toHaveBeenCalledTimes(2));
  });

  it('a vote after the pick closed says "Voting closed"', async () => {
    (castVote as jest.Mock).mockRejectedValueOnce({ message: 'voting_closed' });
    await renderIt();
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Yes' })[0]);
    expect(await screen.findByText('Voting closed')).toBeTruthy();
  });

  it('flags an option added after the viewer voted', async () => {
    mockQuery = ready(detail({ myVotes: { sketch: 'yes', clay: 'no' } }));
    await renderIt();
    expect(screen.getAllByText('New option')).toHaveLength(1);
  });

  it('only the organizer sees Close voting now and Cancel; closing asks first', async () => {
    await renderIt();
    expect(screen.queryByRole('button', { name: 'Close voting now' })).toBeNull();

    mockAuth = { userId: 'maya' };
    const { rerender } = await renderIt();
    await rerender(<QueryClientProvider client={new QueryClient()}><PickScreen pickId="p1" /></QueryClientProvider>);
    await press('Close voting now');
    expect(closePick).not.toHaveBeenCalled(); // confirmation first
    await press('Close voting');
    await waitFor(() => expect(closePick).toHaveBeenCalledWith('p1'));
  });

  it('the organizer can cancel after confirming', async () => {
    mockAuth = { userId: 'maya' };
    await renderIt();
    await press('Cancel this pick');
    await press('Cancel pick');
    await waitFor(() => expect(cancelPick).toHaveBeenCalledWith('p1'));
  });
});

describe('closed pick: the result (P0-09)', () => {
  const closed = (extra = {}) => detail({
    tallies: WORKED_TALLIES,
    pick: { state: 'closed', winner_option_id: 'sketch', tie_rule: TIE_SENTENCE, ...extra },
  });

  it('highlights the winner, names the deciding rule and lists options in final order', async () => {
    mockQuery = ready(closed());
    await renderIt();
    expect(screen.getByText('Voting closed')).toBeTruthy();
    expect(screen.getByText(TIE_SENTENCE)).toBeTruthy();
    expect(screen.getByText('Winner')).toBeTruthy();
    const names = screen.getAllByText(/^(Sketch and stroll|Clay and conversation|Barton Springs swim)$/).map((n) => n.props.children);
    expect(names.slice(-3)).toEqual(['Sketch and stroll', 'Clay and conversation', 'Barton Springs swim']);
    expect(screen.queryByRole('radio', { name: 'Yes' })).toBeNull(); // no voting any more
  });

  it('the organizer plans from the result; a member is told who will', async () => {
    mockAuth = { userId: 'maya' };
    mockQuery = ready(closed());
    const { rerender } = await renderIt();
    await press('Plan this');
    expect(mockRouter.push).toHaveBeenCalledWith('/plan/new?pickId=p1');

    mockAuth = { userId: 'jordan' };
    await rerender(<QueryClientProvider client={new QueryClient()}><PickScreen pickId="p1" /></QueryClientProvider>);
    expect(screen.getByText('Maya will send a plan from this result.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Plan this' })).toBeNull();
  });

  it('shows the organizer\'s choice and the vote result when they differ', async () => {
    mockQuery = ready(closed({ override_option_id: 'clay' }));
    await renderIt();
    expect(screen.getByText('Maya chose Clay and conversation instead of the vote winner, Sketch and stroll.')).toBeTruthy();
    expect(screen.getByText(`Vote result: ${TIE_SENTENCE}`)).toBeTruthy();
  });

  it('nobody voted: the organizer chooses an option', async () => {
    mockAuth = { userId: 'maya' };
    mockQuery = ready(detail({ pick: { state: 'closed', tie_rule: 'No votes were cast. The organizer chooses an option.' } }));
    await renderIt();
    expect(screen.getByText('Nobody voted')).toBeTruthy();
    await press('Choose Barton Springs swim');
    await waitFor(() => expect(overridePick).toHaveBeenCalledWith('p1', 'swim'));
  });

  it('planned picks link to their plan', async () => {
    mockQuery = ready(closed({ state: 'planned' }));
    mockQuery = ready({ ...closed({ state: 'planned' }), planId: 'plan-1' });
    await renderIt();
    expect(screen.getByText('Planned')).toBeTruthy();
    await press('Open the plan');
    expect(mockRouter.push).toHaveBeenCalledWith('/plan/plan-1');
  });

  it('cancelled picks say who cancelled', async () => {
    mockQuery = ready(detail({ pick: { state: 'cancelled' } }));
    await renderIt();
    expect(screen.getByText('Maya cancelled this pick.')).toBeTruthy();
  });
});

describe('states', () => {
  it('loading, error with retry, and not-available', async () => {
    mockQuery = { data: undefined, isPending: true, isError: false, isRefetching: false, refetch: jest.fn() };
    const { rerender } = await renderIt();
    expect(screen.getByLabelText('Loading')).toBeTruthy();

    const refetch = jest.fn();
    mockQuery = { data: undefined, isPending: false, isError: true, isRefetching: false, refetch };
    await rerender(<QueryClientProvider client={new QueryClient()}><PickScreen pickId="p1" /></QueryClientProvider>);
    expect(screen.getByText("Couldn't load the latest votes.")).toBeTruthy();
    await press('Try again');
    expect(refetch).toHaveBeenCalled();

    mockQuery = ready(null);
    await rerender(<QueryClientProvider client={new QueryClient()}><PickScreen pickId="p1" /></QueryClientProvider>);
    expect(screen.getByText('This pick is no longer available')).toBeTruthy();
  });
});
