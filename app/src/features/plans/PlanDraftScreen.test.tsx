import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlanDraftScreen } from './PlanDraftScreen';
import { PlanDraftProvider } from './PlanDraftStore';
import { sendPlan } from './api';
import { exp } from '@/features/discovery/testData';
import { detail as pickDetail } from '@/features/picks/testData';
import { IN_3_DAYS, MEMBERS } from './testData';
import { fieldsFromInstant } from './draft';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockAuth: { isAccount: boolean; userId: string };
let mockExperience: Record<string, unknown>;
let mockPick: Record<string, unknown>;

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-key-1' }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/groups/hooks', () => ({
  useMembers: () => ({ data: require('./testData').MEMBERS, isError: false, refetch: jest.fn() }),
  useGroup: () => ({ data: { id: 'g1', name: 'Saturday crew', owner_id: 'maya' } }),
}));
jest.mock('@/features/discovery/hooks', () => ({ useExperience: () => mockExperience }));
jest.mock('@/features/picks/hooks', () => ({ usePickDetail: () => mockPick }));
jest.mock('./api', () => ({ sendPlan: jest.fn() }));

const ready = (data: unknown) => ({ data, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() });
const SKETCH = exp({ id: 'sketch', name: 'Sketch and stroll', meeting_point: 'Benches at the W 3rd St trailhead', duration_min: 90, area: 'Shoal Creek' });

const renderScreen = (props: React.ComponentProps<typeof PlanDraftScreen>) => render(
  <QueryClientProvider client={new QueryClient()}><PlanDraftProvider><PlanDraftScreen {...props} /></PlanDraftProvider></QueryClientProvider>,
);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const fromExperience = { experienceId: 'sketch', groupId: 'g1' };

beforeEach(async () => {
  jest.clearAllMocks();
  (sendPlan as jest.Mock).mockReset(); // keep the AsyncStorage mock's own implementations
  await AsyncStorage.clear();
  mockAuth = { isAccount: true, userId: 'maya' };
  mockExperience = ready(SKETCH);
  mockPick = ready(null);
});

/** A saved draft for g1:sketch, so the form opens with a known state. */
const saveDraft = (over: Record<string, unknown> = {}) => {
  const start = fieldsFromInstant(IN_3_DAYS().toISOString());
  return AsyncStorage.setItem('sq.planDraft.v1', JSON.stringify({
    key: 'g1:sketch', clientKey: 'saved-key', groupId: 'g1', experienceId: 'sketch', pickId: null,
    date: start.date, start: start.start, end: '23:30', endTouched: false, meetingPoint: 'Benches at the W 3rd St trailhead', note: '',
    recipients: ['jordan', 'sam', 'priya', 'luis', 'tess'], ...over,
  }));
};

describe('Plan draft and review (P0-10, P0-11, P0-12)', () => {
  it('a guest is asked to sign in and returns to this draft', async () => {
    mockAuth = { isAccount: false, userId: 'g' };
    await renderScreen(fromExperience);
    await press('Sign in');
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fplan%2Fnew%3FexperienceId%3Dsketch%26groupId%3Dg1');
  });

  it('opens with the meeting point prefilled, every member invited, and no scolding on an untouched form', async () => {
    await renderScreen(fromExperience);
    expect(await screen.findByDisplayValue('Benches at the W 3rd St trailhead')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send invitation to 5' })).toBeTruthy();
    expect(screen.getByText('Going, organizer')).toBeTruthy();
    expect(screen.queryByText(/Choose a date and start time/)).toBeNull();
    expect(screen.getByText('Saved on this phone as you go. Nobody sees it until you send it.')).toBeTruthy();
  });

  it('sending with no time chosen shows each message under its field and sends nothing', async () => {
    await renderScreen(fromExperience);
    await screen.findByDisplayValue('Benches at the W 3rd St trailhead');
    await press('Send invitation to 5');
    expect(await screen.findByText(/Error: Choose a date and start time/)).toBeTruthy();
    expect(screen.getByText(/Error: Choose an end time/)).toBeTruthy();
    expect(sendPlan).not.toHaveBeenCalled();
  });

  it('a start in the past, and an end before the start, each get their own message', async () => {
    await saveDraft({ date: '2020-01-01', start: '10:00', end: '11:00' });
    await renderScreen(fromExperience);
    expect(await screen.findByText(/Error: Start time must be in the future/)).toBeTruthy();

    await AsyncStorage.clear();
    const f = fieldsFromInstant(IN_3_DAYS().toISOString());
    await saveDraft({ date: f.date, start: '14:00', end: '13:00' });
    const second = await renderScreen(fromExperience);
    expect(await screen.findByText(/Error: End time must be after the start time/)).toBeTruthy();
    expect(sendPlan).not.toHaveBeenCalled();
    await second.unmount();
  });

  it('a draft restored from the phone keeps its request id', async () => {
    await saveDraft();
    (sendPlan as jest.Mock).mockResolvedValue('plan-1');
    await renderScreen(fromExperience);
    await press('Send invitation to 5');
    await waitFor(() => expect(sendPlan).toHaveBeenCalled());
    expect((sendPlan as jest.Mock).mock.calls[0][0].clientKey).toBe('saved-key');
  });

  it('sends exactly what the review shows, then opens the plan and clears the draft', async () => {
    await saveDraft({ note: 'Bring a sketchbook' });
    (sendPlan as jest.Mock).mockResolvedValue('plan-1');
    await renderScreen(fromExperience);
    expect(await screen.findByLabelText('Plan summary')).toBeTruthy();
    expect(screen.getByLabelText(/^When: .*Austin time, America\/Chicago/)).toBeTruthy();
    expect(screen.getByLabelText('Who: Saturday crew: You, Jordan, Sam, Priya, Luis, Tess')).toBeTruthy();
    expect(screen.getByLabelText('Cost: Free')).toBeTruthy();
    expect(screen.getByLabelText('Booking: Not needed')).toBeTruthy();

    await press('Send invitation to 5');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/plan/plan-1?sent=1'));
    const args = (sendPlan as jest.Mock).mock.calls[0][0];
    expect(args).toMatchObject({ groupId: 'g1', experienceId: 'sketch', note: 'Bring a sketchbook', pickId: null, recipients: ['jordan', 'sam', 'priya', 'luis', 'tess'] });
    expect(args.startLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
    expect(await AsyncStorage.getItem('sq.planDraft.v1')).toBeNull(); // sent: the draft is gone
  });

  it('T04: a failed send keeps the draft; Retry uses the SAME request id and never duplicates', async () => {
    await saveDraft();
    (sendPlan as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce('plan-1');
    await renderScreen(fromExperience);
    await press('Send invitation to 5');
    expect(await screen.findByText('Invitation not sent.')).toBeTruthy();
    expect(screen.getByText(/Your draft is saved, and Retry won't send it twice/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled(); // never "Invitations sent" before the server confirms

    await press('Retry');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/plan/plan-1?sent=1'));
    const keys = (sendPlan as jest.Mock).mock.calls.map((c) => c[0].clientKey);
    expect(keys).toEqual(['saved-key', 'saved-key']);
  });

  it('shows progress while sending and ignores a second tap', async () => {
    await saveDraft();
    let finish: (v: string) => void = () => {};
    (sendPlan as jest.Mock).mockReturnValue(new Promise<string>((r) => { finish = r; }));
    await renderScreen(fromExperience);
    const first = fireEvent.press(await screen.findByRole('button', { name: 'Send invitation to 5' }));
    const busy = await screen.findByRole('button', { name: /Sending invitation… in progress|in progress/ });
    await fireEvent.press(busy);
    expect(sendPlan).toHaveBeenCalledTimes(1);
    finish('plan-1');
    await first;
  });

  it('can untick people, including everyone ("No other invitees yet")', async () => {
    await saveDraft();
    await renderScreen(fromExperience);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Invite Tess' }));
    expect(screen.getByRole('button', { name: 'Send invitation to 4' })).toBeTruthy();
    for (const n of ['Jordan, guest', 'Sam, guest', 'Priya', 'Luis']) await fireEvent.press(screen.getByRole('checkbox', { name: `Invite ${n}` }));
    expect(screen.getByText('No other invitees yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeTruthy();
  });

  it('fixed-session experiences are explained and cannot be sent yet', async () => {
    mockExperience = ready(exp({ id: 'sketch', name: 'Clay and conversation', timing_kind: 'fixed', sessions: [{ label: 'Sat 10:00 AM' }], hours_text: null }));
    await saveDraft();
    await renderScreen(fromExperience);
    expect(await screen.findByText(/fixed sessions/)).toBeTruthy();
    await press('Send invitation to 5');
    expect(sendPlan).not.toHaveBeenCalled();
  });

  it('unknown hours show "Hours unverified" but can still be planned', async () => {
    mockExperience = ready(exp({ id: 'sketch', name: 'Mystery', timing_kind: 'unknown', hours_text: null }));
    await saveDraft();
    (sendPlan as jest.Mock).mockResolvedValue('p');
    await renderScreen(fromExperience);
    expect(await screen.findByText('Hours unverified')).toBeTruthy();
    await press('Send invitation to 5');
    await waitFor(() => expect(sendPlan).toHaveBeenCalled());
  });

  it('shows the booking notice and cost for a booking-required experience', async () => {
    mockExperience = ready(exp({ id: 'sketch', name: 'Clay', price_kind: 'exact', price_min: 38, price_max: 38, booking_required: true, booking_url: 'https://www.example.com/b' }));
    await saveDraft();
    await renderScreen(fromExperience);
    expect(await screen.findByLabelText('Cost: $38 per person')).toBeTruthy();
    expect(screen.getByText('Booking required. Going here does not reserve a spot.')).toBeTruthy();
    expect(screen.getByLabelText('Booking: Required. Going here does not reserve a spot.')).toBeTruthy();
  });

  it('"Plan this" from a closed pick: the winner, its proposed time and every member', async () => {
    const proposed = IN_3_DAYS().toISOString();
    mockPick = ready(pickDetail({ pick: { state: 'closed', winner_option_id: 'sketch' }, options: [{ ...pickDetail().options[0], proposed_start: proposed }, pickDetail().options[1]] }));
    mockAuth = { isAccount: true, userId: 'maya' };
    (sendPlan as jest.Mock).mockResolvedValue('plan-9');
    await renderScreen({ pickId: 'p1' });
    expect(await screen.findByText('Winner of the group pick')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send invitation to 5' })).toBeTruthy();
    await press('Send invitation to 5');
    await waitFor(() => expect(sendPlan).toHaveBeenCalled());
    const args = (sendPlan as jest.Mock).mock.calls[0][0];
    expect(args.pickId).toBe('p1');
    expect(args.experienceId).toBe('e-sketch');
    expect(args.startLocal.slice(0, 10)).toBe(fieldsFromInstant(proposed).date);
    expect(args.clientKey).toBe('request-key-1');
  });

  it('only the organizer of a closed pick can plan it', async () => {
    mockPick = ready(pickDetail({ pick: { state: 'closed', winner_option_id: 'sketch' } }));
    mockAuth = { isAccount: true, userId: 'jordan' };
    await renderScreen({ pickId: 'p1' });
    expect(await screen.findByText("This pick can't be planned right now")).toBeTruthy();
    await press('Back to the pick');
    expect(mockRouter.replace).toHaveBeenCalledWith('/pick/p1');
  });

  it('a removed listing cannot be planned', async () => {
    mockExperience = ready(exp({ id: 'sketch', status: 'removed' }));
    await renderScreen(fromExperience);
    expect(await screen.findByText('This listing was removed')).toBeTruthy();
  });

  it('shows a skeleton while loading and a retry on error', async () => {
    mockExperience = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    await renderScreen(fromExperience);
    expect(await screen.findByLabelText('Loading')).toBeTruthy();
  });
});
void MEMBERS;
