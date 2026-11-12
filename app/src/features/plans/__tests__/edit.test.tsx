import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PlanScreen } from '../PlanScreen';
import type { RsvpStatus } from '../plan';

type Result = { data: unknown; error: { message: string } | null };
const rev = (revision: number, start: string, end: string, point: string) =>
  ({ revision, start_at: start, end_at: end, meeting_point: point, note: null, price_snapshot: { kind: 'free', min: null, max: null }, booking_required: false });
let mockPlan: Record<string, unknown>;
let mockRevisions: ReturnType<typeof rev>[];
let mockRsvps: { user_id: string; status: RsvpStatus; revision: number }[];
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();

function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) b[m] = () => b;
  const result = (): Result => ({ data: table === 'plans' ? mockPlan : table === 'rsvps' ? mockRsvps : mockRevisions, error: null });
  b.maybeSingle = async () => result();
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(result()).then(resolve);
  return b;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: (fn: string, args: Record<string, unknown>) => fn === 'get_profile_cards'
    ? Promise.resolve({ data: [{ user_id: 'maya', display_name: 'Maya' }, { user_id: 'jordan', display_name: 'Jordan' }, { user_id: 'sam', display_name: 'Sam' }], error: null })
    : mockRpc(fn, args),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  removeChannel: async () => {},
} }));
// Tapping a mocked picker moves its value one hour later.
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  function MockPicker({ accessibilityLabel, value, onChange }: { accessibilityLabel: string; value: Date; onChange: (e: unknown, d: Date) => void }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={() => onChange({}, new Date(value.getTime() + 3_600_000))} />;
  }
  return MockPicker;
});

beforeEach(() => {
  mockRpc.mockReset();
  mockPlan = { id: 'p1', experience_name: 'Barton Springs', organizer_id: 'maya', state: 'sent', cancel_reason: null, current_revision: 1 };
  mockRevisions = [rev(1, '2099-11-14T16:00:00Z', '2099-11-14T18:00:00Z', 'South gate')];
  mockRsvps = [{ user_id: 'maya', status: 'going', revision: 1 }, { user_id: 'jordan', status: 'going', revision: 1 }, { user_id: 'sam', status: 'awaiting', revision: 1 }];
});

const show = (viewer: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <PlanScreen planId="p1" viewerId={viewer} />
</QueryClientProvider>);
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

test('moving the start keeps the length, and a material change says who must reconfirm before saving', async () => {
  mockRpc.mockResolvedValue({ data: { material: true, changed: ['start_local', 'end_local'], revision: 2, needs_reconfirm: 1 }, error: null });
  await show('maya');
  await screen.findByText('Barton Springs');
  await tap('Edit plan');
  await tap('Starts time');
  await tap('Save');
  expect(screen.getByText('Changing: Start time, End time.')).toBeTruthy();
  expect(screen.getByText('1 Going invitee will need to reconfirm.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
  await tap('Save changes');
  expect(mockRpc).toHaveBeenCalledWith('edit_plan', { plan_id: 'p1', changes: { start_local: '2099-11-14T11:00', end_local: '2099-11-14T13:00' } });
});

test('a note-only edit saves straight away and sends only the note', async () => {
  mockRpc.mockResolvedValue({ data: { material: false, changed: ['note'], revision: 1, needs_reconfirm: 0 }, error: null });
  await show('maya');
  await screen.findByText('Barton Springs');
  await tap('Edit plan');
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Bring towels'); });
  await tap('Save');
  expect(mockRpc).toHaveBeenCalledWith('edit_plan', { plan_id: 'p1', changes: { note: 'Bring towels' } });
});

test('a server refusal shows under the field and keeps the edit', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'nonexistent_local_time' } });
  await show('maya');
  await screen.findByText('Barton Springs');
  await tap('Edit plan');
  await tap('Starts time');
  await tap('Save');
  await tap('Save changes');
  expect(screen.getByText('That time doesn’t exist on this date (clocks skip ahead). Pick another time.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
});

test('an invitee who needs to reconfirm sees old and new values and answers the new revision', async () => {
  mockPlan.current_revision = 2;
  mockRevisions.push(rev(2, '2099-11-14T17:00:00Z', '2099-11-14T19:00:00Z', 'South gate'));
  mockRsvps[1] = { user_id: 'jordan', status: 'needs_reconfirm', revision: 1 };
  mockRpc.mockResolvedValue({ data: null, error: null });
  await show('jordan');
  expect(await screen.findByText('This plan changed. Are you still going?')).toBeTruthy();
  expect(screen.getByLabelText('When changed from Sat, Nov 14 · 10:00 AM to 12:00 PM to Sat, Nov 14 · 11:00 AM to 1:00 PM')).toBeTruthy();
  await tap('Still going');
  expect(mockRpc).toHaveBeenCalledWith('respond', { plan_id: 'p1', revision: 2, status: 'going' });
});

test('a stale answer reloads the plan and asks again', async () => {
  mockPlan.current_revision = 2;
  mockRevisions.push(rev(2, '2099-11-14T17:00:00Z', '2099-11-14T19:00:00Z', 'South gate'));
  mockRsvps[1] = { user_id: 'jordan', status: 'needs_reconfirm', revision: 1 };
  mockRpc.mockImplementation(async () => {
    // Another edit lands first: revision 3 moves the meeting point.
    mockPlan.current_revision = 3;
    mockRevisions.push(rev(3, '2099-11-14T17:00:00Z', '2099-11-14T19:00:00Z', 'North gate'));
    return { data: null, error: { message: 'stale_revision' } };
  });
  await show('jordan');
  await screen.findByText('This plan changed. Are you still going?');
  await tap('Still going');
  expect(await screen.findByText('Now: North gate')).toBeTruthy();
  expect(screen.getByText('This plan just changed. Check the new details and answer again.')).toBeTruthy();
});

test('the edit sheet covers date and time for the start and the end, the meeting point and the note', async () => {
  await show('maya');
  await screen.findByText('Barton Springs');
  await tap('Edit plan');
  for (const name of ['Starts date', 'Starts time', 'Ends date', 'Ends time']) expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.getByLabelText('Meeting point')).toBeTruthy();
  expect(screen.getByLabelText('Note (optional)')).toBeTruthy();
});
