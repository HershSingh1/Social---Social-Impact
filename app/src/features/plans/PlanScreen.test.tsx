import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanScreen } from './PlanScreen';
import { editPlan, respond } from './api';
import { planDetail } from './testData';

const mockRouter = { navigate: jest.fn() };
let mockAuth: { userId: string };
let mockQuery: Record<string, unknown>;
let mockParams: { sent?: string };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('./hooks', () => ({ usePlanDetail: () => mockQuery }));
jest.mock('./api', () => ({ respond: jest.fn(), editPlan: jest.fn() }));

const ready = (data: unknown) => ({ data, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() });
const renderIt = () => render(<QueryClientProvider client={new QueryClient()}><PlanScreen planId="plan1" /></QueryClientProvider>);
const radio = (name: string | RegExp) => screen.getByRole('radio', { name });

beforeEach(() => {
  jest.resetAllMocks();
  mockAuth = { userId: 'jordan' };
  mockParams = {};
  mockQuery = ready(planDetail());
});

describe('Plan detail (P0-13)', () => {
  it('shows the plan, the booking notice, the counts and every invitee\'s status in words', async () => {
    await renderIt();
    expect(screen.getByText('Sketch and stroll')).toBeTruthy();
    expect(screen.getByText('Organized by Maya')).toBeTruthy();
    expect(screen.getByText('When, Austin time')).toBeTruthy();
    expect(screen.getByText('Benches at the W 3rd St trailhead')).toBeTruthy();
    expect(screen.getByText('No booking needed.')).toBeTruthy();
    expect(screen.getByLabelText('1 going, 2 awaiting reply, 0 can\'t go, 0 need to reconfirm')).toBeTruthy();
    expect(screen.getByText('3 invited')).toBeTruthy();
    expect(screen.getByLabelText('Maya, Going, organizer')).toBeTruthy();
    expect(screen.getByLabelText('Jordan, you, guest, Awaiting reply')).toBeTruthy();
  });

  it('confirms the send with "Invitations sent" only when arriving from a successful send', async () => {
    mockParams = { sent: '1' };
    await renderIt();
    expect(screen.getByText('Invitations sent')).toBeTruthy();
    expect(screen.getByText('1 Going, 2 Awaiting reply.')).toBeTruthy();
  });

  it('Going is saved against the current revision and shows "saving" until the server confirms', async () => {
    let finish: (v: unknown) => void = () => {};
    (respond as jest.Mock).mockReturnValue(new Promise((r) => { finish = r; }));
    await renderIt();
    const p = fireEvent.press(radio('Going'));
    expect(await screen.findByRole('radio', { name: 'Going, saving' })).toBeTruthy();
    expect(respond).toHaveBeenCalledWith('plan1', 1, 'going');
    // not optimistic: the previous answer (Awaiting) is still what is shown as saved
    expect(screen.getByLabelText('Jordan, you, guest, Awaiting reply')).toBeTruthy();
    finish({});
    await p;
  });

  it('a failed answer keeps the previous one and offers Retry', async () => {
    (respond as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce({});
    await renderIt();
    await fireEvent.press(radio('Can\'t go'));
    expect(await screen.findByText(/No connection/)).toBeTruthy();
    expect(screen.getByLabelText('Jordan, you, guest, Awaiting reply')).toBeTruthy(); // unchanged
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    expect((respond as jest.Mock).mock.calls[1]).toEqual(['plan1', 1, 'cant_go']);
  });

  it('an answer from a stale screen is rejected: it says so and asks again (no Retry of the old answer)', async () => {
    (respond as jest.Mock).mockRejectedValue({ message: 'stale_revision' });
    await renderIt();
    await fireEvent.press(radio('Going'));
    expect(await screen.findByText('This plan just changed. Check the new details and answer again.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('after a material change (P0-14)', () => {
  const edited = () => {
    const base = planDetail();
    const prevStart = new Date(base.current.start_at);
    return planDetail({
      plan: { current_revision: 2 },
      current: { ...base.current, revision: 2, start_at: new Date(prevStart.getTime() + 3_600_000).toISOString(), end_at: new Date(prevStart.getTime() + 3_600_000 + 5_400_000).toISOString() },
      previous: base.current,
      rsvps: [
        { user_id: 'maya', name: 'Maya', isGuest: false, status: 'going', revision: 2 },
        { user_id: 'jordan', name: 'Jordan', isGuest: true, status: 'needs_reconfirm', revision: 1 },
        { user_id: 'sam', name: 'Sam', isGuest: true, status: 'awaiting', revision: 1 },
      ],
    });
  };

  it('Jordan sees the old and new time and answers again against the NEW revision', async () => {
    mockQuery = ready(edited());
    (respond as jest.Mock).mockResolvedValue({});
    await renderIt();
    expect(screen.getByText('The plan changed. Are you still going?')).toBeTruthy();
    expect(screen.getByText(/^Changed from /)).toBeTruthy();
    expect(screen.getByLabelText('Jordan, you, guest, Needs reconfirmation')).toBeTruthy();
    expect(screen.getByLabelText('1 going, 1 awaiting reply, 0 can\'t go, 1 need to reconfirm')).toBeTruthy();
    await fireEvent.press(radio('Still going'));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('plan1', 2, 'going'));
  });

  it('the organizer is not asked to reconfirm', async () => {
    mockAuth = { userId: 'maya' };
    mockQuery = ready(edited());
    await renderIt();
    expect(screen.queryByText('The plan changed. Are you still going?')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Going' })).toBeNull();
  });
});

describe('organizer view', () => {
  it('has Edit plan, never an answer to give, and sees who is Going', async () => {
    mockAuth = { userId: 'maya' };
    await renderIt();
    expect(screen.getByRole('button', { name: 'Edit plan' })).toBeTruthy();
    expect(screen.queryByText('Your response')).toBeNull();
    expect(screen.getByLabelText('Maya, you, Going, organizer')).toBeTruthy();
  });

  it('after saving an edit says how many people were asked to reconfirm', async () => {
    mockAuth = { userId: 'maya' };
    mockQuery = ready(planDetail({ rsvps: [
      { user_id: 'maya', name: 'Maya', isGuest: false, status: 'going', revision: 1 },
      { user_id: 'jordan', name: 'Jordan', isGuest: true, status: 'going', revision: 1 },
      { user_id: 'sam', name: 'Sam', isGuest: true, status: 'going', revision: 1 },
    ] }));
    (editPlan as jest.Mock).mockResolvedValue({ material: true, changed: true, revision: 2, needs_reconfirm: 2 });
    await renderIt();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit plan' }));
    await fireEvent.changeText(await screen.findByLabelText('Meeting point'), 'Stone footbridge');
    expect(screen.getByText('2 Going invitees will need to reconfirm.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(editPlan).toHaveBeenCalled());
    expect(await screen.findByText('Saved. 2 invitees asked to reconfirm.')).toBeTruthy();
    expect(editPlan).toHaveBeenCalledWith('plan1', { meeting_point: 'Stone footbridge' });
  });
});

describe('locked and unavailable plans', () => {
  it('a cancelled plan says so and closes responses', async () => {
    mockQuery = ready(planDetail({ plan: { state: 'cancelled', cancel_reason: 'Weather' } }));
    await renderIt();
    expect(screen.getByText('Maya cancelled this plan.')).toBeTruthy();
    expect(screen.getByText('Weather. Responses are closed.')).toBeTruthy();
    expect(radio('Going').props.accessibilityState.disabled).toBe(true);
  });

  it('once the plan has started, answers are locked', async () => {
    const d = planDetail();
    mockQuery = ready({ ...d, current: { ...d.current, start_at: new Date(Date.now() - 3_600_000).toISOString(), end_at: new Date(Date.now() + 3_600_000).toISOString() } });
    await renderIt();
    expect(screen.getByText('This plan has started, so answers are locked.')).toBeTruthy();
    expect(radio('Going').props.accessibilityState.disabled).toBe(true);
  });

  it('a member who was not invited cannot see the plan', async () => {
    mockQuery = ready(null);
    await renderIt();
    expect(screen.getByText("This plan isn't available to you")).toBeTruthy();
    expect(screen.getByText(/Joining the group later doesn't add you to a plan/)).toBeTruthy();
  });

  it('loading and error states', async () => {
    mockQuery = { data: undefined, isPending: true, isError: false, isRefetching: false, refetch: jest.fn() };
    const { rerender } = await renderIt();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    mockQuery = { data: undefined, isPending: false, isError: true, isRefetching: false, refetch: jest.fn() };
    await rerender(<QueryClientProvider client={new QueryClient()}><PlanScreen planId="plan1" /></QueryClientProvider>);
    expect(screen.getByText("Couldn't load this plan.")).toBeTruthy();
  });
});
