import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import { InviteesPanel } from '../InviteesPanel';
import { InviteRefused, planLinkUrl, previewLink } from '../invites';
import { PlanLinkScreen } from '../PlanLinkScreen';
import type { Plan } from '../plan';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
let mockMembers: { user_id: string }[] = [];
function mockBuilder() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) b[m] = () => b;
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve({ data: mockMembers, error: null }).then(resolve);
  return b;
}
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args), from: () => mockBuilder() } }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `sidequest://${path}` }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const names: Record<string, string> = { maya: 'Maya', jordan: 'Jordan', sam: 'Sam', alex: 'Alex', riley: 'Riley' };
const calls = (fn: string) => mockRpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args);
const PREVIEW = { activity: 'Clay and conversation', category: 'Make something', inviter: 'Maya', group: 'Saturday crew',
  start_at: '2099-11-14T16:00:00Z', end_at: '2099-11-14T18:00:00Z', price: { kind: 'exact', min: 30, max: 30 },
  booking_required: true, already_joined: false };

beforeEach(() => {
  mockRpc.mockReset();
  mockMembers = [];
  mockRpc.mockImplementation(async (fn, args) => {
    if (fn === 'get_profile_cards') return { data: (args.user_ids as string[]).map(id => ({ user_id: id, display_name: names[id] ?? id })), error: null };
    if (fn === 'preview_plan_link') return { data: PREVIEW, error: null };
    if (fn === 'join_plan') return { data: 'plan-1', error: null };
    if (fn === 'create_plan_link') return { data: 'a'.repeat(64), error: null };
    return { data: null, error: null };
  });
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

describe('invite api', () => {
  test('a plan link points into the app', () => {
    expect(planLinkUrl('abc123')).toBe('sidequest://plan-link/abc123');
  });
  test('previewing reads the plan, logs invite_viewed, and does not join', async () => {
    const preview = await previewLink('tok');
    expect(preview).toMatchObject({ activity: 'Clay and conversation', inviter: 'Maya', group: 'Saturday crew', alreadyJoined: false });
    expect(calls('join_plan')).toHaveLength(0);
    expect(calls('log_event')).toEqual([{ name: 'invite_viewed', props: { surface: 'plan_link' } }]);
  });
  test('a dead link is a refusal in words; a lost connection is passed on', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'link_unavailable' } });
    await expect(previewLink('tok')).rejects.toBeInstanceOf(InviteRefused);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    await expect(previewLink('tok')).rejects.not.toBeInstanceOf(InviteRefused);
  });
});

describe('plan link screen', () => {
  const show = async (onJoined = jest.fn(), onBack = jest.fn()) => {
    await render(<QueryClientProvider client={client()}><PlanLinkScreen token="tok" onBack={onBack} onJoined={onJoined} /></QueryClientProvider>);
    return { onJoined, onBack };
  };

  test('shows what the plan is and that joining is for this plan only', async () => {
    await show();
    expect(await screen.findByText('Clay and conversation')).toBeTruthy();
    expect(screen.getByText('Maya invited you to a plan with Saturday crew.')).toBeTruthy();
    expect(screen.getByText('$30 per person')).toBeTruthy();
    expect(screen.getByText('Booking required. Each person books their own spot.')).toBeTruthy();
    expect(screen.getByText('Joining adds you to this plan only, not to the group.')).toBeTruthy();
    expect(calls('join_plan')).toHaveLength(0);
  });

  test('Join plan joins once and opens the plan', async () => {
    const { onJoined } = await show();
    await screen.findByText('Clay and conversation');
    await press('Join plan');
    expect(calls('join_plan')).toEqual([{ token: 'tok' }]);
    expect(onJoined).toHaveBeenCalledWith('plan-1');
  });

  test('someone already in sees Open plan', async () => {
    mockRpc.mockImplementation(async fn => fn === 'preview_plan_link' ? { data: { ...PREVIEW, already_joined: true }, error: null } : { data: 'plan-1', error: null });
    await show();
    await screen.findByText('You’re already in this plan.');
    expect(screen.getByRole('button', { name: 'Open plan' })).toBeTruthy();
  });

  test('a link that no longer works says so and offers Back', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'link_unavailable' } });
    const { onBack } = await show();
    expect(await screen.findByText('This link doesn’t work any more. Ask the organizer for a new one.')).toBeTruthy();
    await press('Back');
    expect(onBack).toHaveBeenCalled();
  });

  test('a lost connection offers Try again, not a dead end', async () => {
    mockRpc.mockImplementation(async () => ({ data: null, error: { message: 'Network request failed' } }));
    await show();
    expect(await screen.findByText('Couldn’t open this invite. Check your connection and try again.', {}, { timeout: 4000 })).toBeTruthy();
    mockRpc.mockImplementation(async fn => ({ data: fn === 'preview_plan_link' ? PREVIEW : null, error: null }));
    await press('Try again');
    expect(await screen.findByText('Clay and conversation')).toBeTruthy();
  });

  test('being removed is explained when joining', async () => {
    const { onJoined } = await show();
    await screen.findByText('Clay and conversation');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'removed_from_plan' } });
    await press('Join plan');
    expect(screen.getByText('The organizer removed you from this plan.')).toBeTruthy();
    expect(onJoined).not.toHaveBeenCalled();
  });
});

describe('invitees panel (organizer)', () => {
  const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p1', name: 'Clay', organizerId: 'maya', state: 'sent', cancelReason: null, groupId: 'g1', experienceId: 'e1', updatedAt: '2099-01-01T00:00:00Z',
    current: { revision: 1, startAt: '2099-11-14T16:00:00Z', endAt: '2099-11-14T18:00:00Z', meetingPoint: 'Door', note: null,
      price: { kind: 'exact', min: 30, max: 30 }, bookingRequired: false },
    revisions: [],
    invitees: [{ userId: 'maya', name: 'Maya', status: 'going', isOrganizer: true, answeredRevision: 1 },
      { userId: 'jordan', name: 'Jordan', status: 'awaiting', isOrganizer: false, answeredRevision: 1 }],
    ...over,
  });
  const show = (p = plan()) => render(<QueryClientProvider client={client()}><InviteesPanel plan={p} readAt={Date.parse('2099-11-01T00:00:00Z')} /></QueryClientProvider>);

  test('Share invite link makes the link and opens the share sheet with it', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await show();
    await press('Share invite link');
    expect(calls('create_plan_link')).toEqual([{ plan_id: 'p1' }]);
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0][0] as { message: string }).message).toContain('a'.repeat(64));
  });

  test('turning the link off asks first and says people already in stay in', async () => {
    await show();
    await press('Turn off invite link');
    expect(screen.getByText(/People already in the plan stay in/)).toBeTruthy();
    expect(calls('revoke_plan_link')).toHaveLength(0);
    await press('Turn off link');
    expect(calls('revoke_plan_link')).toEqual([{ plan_id: 'p1' }]);
  });

  test('adding people lists only group members who are not invited, and adds the ones picked', async () => {
    mockMembers = [{ user_id: 'maya' }, { user_id: 'jordan' }, { user_id: 'sam' }, { user_id: 'alex' }];
    await show();
    await press('Add people from the group');
    expect(await screen.findByRole('checkbox', { name: 'Sam' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Alex' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Jordan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Sam' })));
    await press('Add 1');
    expect(calls('add_invitees')).toEqual([{ plan_id: 'p1', user_ids: ['sam'] }]);
  });

  test('when everyone is invited, adding says so and points to the link', async () => {
    mockMembers = [{ user_id: 'maya' }, { user_id: 'jordan' }];
    await show();
    await press('Add people from the group');
    expect(await screen.findByText('Everyone is already invited')).toBeTruthy();
  });

  test('removing someone calls remove_invitee for that person; the organizer is not in the list', async () => {
    await show();
    await press('Remove people');
    expect(screen.queryByRole('button', { name: 'Remove Maya' })).toBeNull();
    await press('Remove Jordan');
    expect(calls('remove_invitee')).toEqual([{ plan_id: 'p1', user_id: 'jordan' }]);
  });

  test('a refusal from the server is shown in words', async () => {
    await show();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'plan_cancelled' } });
    await press('Share invite link');
    expect(screen.getByText('This plan was cancelled.')).toBeTruthy();
  });

  test('shows nothing once the plan has ended or been cancelled', async () => {
    await render(<QueryClientProvider client={client()}><InviteesPanel plan={plan()} readAt={Date.parse('2099-12-01T00:00:00Z')} /></QueryClientProvider>);
    expect(screen.queryByText('Invite more people')).toBeNull();
    await render(<QueryClientProvider client={client()}><InviteesPanel plan={plan({ state: 'cancelled' })} readAt={0} /></QueryClientProvider>);
    expect(screen.queryByText('Invite more people')).toBeNull();
  });
});
