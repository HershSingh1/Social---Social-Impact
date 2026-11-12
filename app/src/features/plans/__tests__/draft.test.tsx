import { beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PlanDraftScreen } from '../PlanDraftScreen';
import { listedSessions, newDraft, validateDraft, type PlanDraft } from '../draft';

type Result = { data: unknown; error: { message: string } | null };
const mockSend = jest.fn<(args: Record<string, unknown>) => Promise<Result>>();
function mockBuilder(result: Result) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order']) b[m] = () => b;
  b.maybeSingle = async () => result;
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}
const flexible = { name: 'Barton Springs', meeting_point: 'South gate', hours_text: '5 AM–10 PM', duration_min: 120, timing_kind: 'flexible',
  price_kind: 'exact', price_min: 9, price_max: 9, booking_required: false, sessions: null };
let mockExperience: Record<string, unknown> = flexible;
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table === 'experiences'
    ? { data: mockExperience, error: null }
    : { data: [{ user_id: 'maya' }, { user_id: 'jordan' }, { user_id: 'sam' }], error: null }),
  rpc: (fn: string, args: Record<string, unknown>) => fn === 'send_plan' ? mockSend(args)
    : Promise.resolve({ data: [{ user_id: 'jordan', display_name: 'Jordan' }, { user_id: 'sam', display_name: 'Sam' }], error: null }),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/datetimepicker', () => () => null);
let mockKey = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKey}` }));

const NOW = Date.parse('2026-11-13T18:00:00Z');
const source = { groupId: 'g1', experienceId: 'e1' };
const draft = (change: Partial<PlanDraft> = {}): PlanDraft => ({
  ...newDraft(source, { start: new Date('2026-11-14T16:00:00Z'), durationMin: 120, meetingPoint: 'South gate', recipients: ['jordan'] }), ...change,
});

beforeEach(async () => { mockSend.mockReset(); mockKey = 0; mockExperience = flexible; await AsyncStorage.clear(); });

test('validation: past start, end before start, a skipped DST hour, and field lengths', () => {
  expect(validateDraft(draft(), NOW)).toEqual({});
  expect(validateDraft(draft({ start: '2026-11-13T17:00:00Z' }), NOW).start).toBe('Pick a start time in the future.');
  expect(validateDraft(draft({ end: '2026-11-14T15:00:00Z' }), NOW).end).toBe('The end has to be after the start.');
  expect(validateDraft(draft({ meetingPoint: '  ' }), NOW).meetingPoint).toBe('Enter where to meet.');
  expect(validateDraft(draft({ meetingPoint: 'x'.repeat(201) }), NOW).meetingPoint).toBe('Use 200 characters or fewer.');
  expect(validateDraft(draft({ note: 'x'.repeat(501) }), NOW).note).toBe('Use 500 characters or fewer.');
});

const wrap = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <PlanDraftScreen source={source} organizerId="maya" proposedStart="2099-11-14T16:00:00Z" onSent={mockOnSent} />
</QueryClientProvider>;
const mockOnSent = jest.fn();
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

test('a new draft ticks every other member, says it is saved on this phone, and survives a restart with the same key', async () => {
  await render(wrap());
  expect(await screen.findByText('Saved on this phone')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Jordan' }).props.accessibilityState.checked).toBe(true);
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Bring towels'); });
  const saved = JSON.parse((await AsyncStorage.getItem('sidequest.planDraft:g1:e1:-'))!) as PlanDraft;
  expect(saved).toMatchObject({ clientKey: 'key-1', note: 'Bring towels', recipients: ['jordan', 'sam'] });

  await screen.unmount();
  await render(wrap());
  expect((await screen.findByLabelText('Note (optional)')).props.value).toBe('Bring towels');
  expect(mockKey).toBe(1); // no second key was made
});

test('unticking everyone shows "No other invitees yet"', async () => {
  await render(wrap());
  await screen.findByText('Saved on this phone');
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Jordan' })));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Sam' })));
  expect(screen.getByText('No other invitees yet')).toBeTruthy();
});

test('review names the zone; a failed send keeps the draft and Retry reuses the same client_key', async () => {
  mockSend.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValueOnce({ data: 'plan-1', error: null });
  await render(wrap());
  await screen.findByText('Saved on this phone');
  await tap('Review');
  expect(screen.getByText(/Austin time \(CST\)/)).toBeTruthy();
  expect(screen.getByText('You, Jordan, Sam')).toBeTruthy();

  await tap('Send invitation');
  expect(screen.getByText(/Couldn’t send\. Your draft is saved on this phone/)).toBeTruthy();
  expect(mockOnSent).not.toHaveBeenCalled();
  await tap('Retry');
  expect(mockSend).toHaveBeenCalledTimes(2);
  expect(mockSend.mock.calls[0][0].client_key).toBe('key-1');
  expect(mockSend.mock.calls[1][0].client_key).toBe('key-1');
  expect(mockSend.mock.calls[1][0]).toMatchObject({ start_local: '2099-11-14T10:00', end_local: '2099-11-14T12:00', time_zone: 'America/Chicago' });
  expect(mockOnSent).toHaveBeenCalledWith('plan-1');
  expect(await AsyncStorage.getItem('sidequest.planDraft:g1:e1:-')).toBeNull();
});

test('a server refusal goes back to the form with the message under its field', async () => {
  mockSend.mockResolvedValueOnce({ data: null, error: { message: 'invalid_meeting_point' } });
  await render(wrap());
  await screen.findByText('Saved on this phone');
  await tap('Review');
  await tap('Send invitation');
  expect(screen.getByText('Enter where to meet, up to 200 characters.')).toBeTruthy();
  expect(screen.getByLabelText('Meeting point').props.value).toBe('South gate');
});

test('listed sessions: upcoming ones formatted in Austin wall-clock time, past ones dropped', () => {
  expect(listedSessions([
    { start_local: '2026-11-12T10:00', end_local: '2026-11-12T12:00' },
    { start_local: '2026-11-14T10:00', end_local: '2026-11-14T12:00' },
    { start_local: '2026-11-15 19:30', end_local: '2026-11-15 21:00' },
  ], new Date(NOW))).toEqual(['Sat, Nov 14, 10:00 AM–12:00 PM', 'Sun, Nov 15, 7:30 PM–9:00 PM']);
  expect(listedSessions(null)).toEqual([]);
});

test('a set-time activity shows its sessions as hints and Review still works for any time', async () => {
  mockExperience = { ...flexible, timing_kind: 'fixed', hours_text: null,
    sessions: [{ start_local: '2099-11-14T19:00', end_local: '2099-11-14T21:00' }] };
  await render(wrap());
  expect(await screen.findByText('Sat, Nov 14, 7:00 PM–9:00 PM')).toBeTruthy();
  expect(screen.getByText('Pick any time for your plan.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Review' }).props.accessibilityState.disabled).toBe(false);
  await tap('Review');
  expect(screen.getByText('Review your plan')).toBeTruthy();
});

test('known price and booking: no checkbox, and acknowledged is sent as false', async () => {
  mockSend.mockResolvedValueOnce({ data: 'plan-1', error: null });
  await render(wrap());
  await screen.findByText('Saved on this phone');
  await tap('Review');
  expect(screen.queryByRole('checkbox', { name: /unconfirmed/ })).toBeNull();
  await tap('Send invitation');
  expect(mockSend.mock.calls[0][0].acknowledged).toBe(false);
});

test('unknown price and booking: Send waits for the checkbox, then sends acknowledged with the same key', async () => {
  mockExperience = { ...flexible, price_kind: 'unknown', price_min: null, price_max: null, booking_required: null };
  mockSend.mockResolvedValueOnce({ data: 'plan-1', error: null });
  await render(wrap());
  await screen.findByText('Saved on this phone');
  await tap('Review');
  expect(screen.getByText('Price not confirmed')).toBeTruthy();
  expect(screen.getByText('Booking not confirmed. Check with the provider before you go.')).toBeTruthy();
  const box = screen.getByRole('checkbox', { name: 'I understand the price and booking are unconfirmed' });
  expect(box.props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole('button', { name: 'Send invitation' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText('Tick the box above to send.')).toBeTruthy();
  await tap('Send invitation');
  expect(mockSend).not.toHaveBeenCalled();

  await act(async () => fireEvent.press(box));
  await tap('Send invitation');
  expect(mockSend.mock.calls[0][0]).toMatchObject({ acknowledged: true, client_key: 'key-1' });
  expect(mockOnSent).toHaveBeenCalledWith('plan-1');
});

test('only booking unknown names booking; a server refusal for it stays on Review with the message', async () => {
  mockExperience = { ...flexible, booking_required: null };
  mockSend.mockResolvedValueOnce({ data: null, error: { message: 'unconfirmed_info_not_acknowledged' } });
  await render(wrap());
  await screen.findByText('Saved on this phone');
  await tap('Review');
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'I understand the booking is unconfirmed' })));
  await tap('Send invitation');
  expect(screen.getByText('This listing’s price or booking isn’t confirmed. Tick the box to send anyway.')).toBeTruthy();
  expect(screen.getByText('Review your plan')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'I understand the booking is unconfirmed' }).props.accessibilityState.checked).toBe(false);
});
