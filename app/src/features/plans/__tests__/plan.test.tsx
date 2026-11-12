import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PlanScreen } from '../PlanScreen';
import type { RsvpStatus } from '../plan';

type Result = { data: unknown; error: { message: string } | null };
let mockPlan: Record<string, unknown> | null;
let mockRsvps: { user_id: string; status: RsvpStatus }[];
let mockOnChange: () => void = () => {};
let mockStart = '2099-11-14T16:00:00Z';
const mockRespond = jest.fn<(args: Record<string, unknown>) => Promise<Result>>();
const people = ['maya', 'jordan', 'sam', 'alex', 'riley', 'casey'];

function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'gte']) b[m] = () => b;
  const result = (): Result => table === 'plans' ? { data: mockPlan, error: null }
    : table === 'rsvps' ? { data: mockRsvps, error: null }
    : { data: [{ revision: 1, start_at: mockStart, end_at: '2099-11-14T18:00:00Z', meeting_point: 'South gate',
      note: null, price_snapshot: { kind: 'exact', min: 9, max: 9 }, booking_required: true }], error: null };
  b.maybeSingle = async () => result();
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(result()).then(resolve);
  return b;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }));
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: (fn: string, args: Record<string, unknown>) => fn === 'respond' ? mockRespond(args)
    : Promise.resolve({ data: people.map(id => ({ user_id: id, display_name: id[0].toUpperCase() + id.slice(1) })), error: null }),
  channel: () => {
    const c = { on: (_e: string, _f: unknown, cb: () => void) => { mockOnChange = cb; return c; }, subscribe: () => c };
    return c;
  },
  removeChannel: async () => {},
} }));

const statuses = (going: number, awaiting: number, cant: number, reconfirm: number): RsvpStatus[] =>
  [...Array(going).fill('going'), ...Array(cant).fill('cant_go'), ...Array(reconfirm).fill('needs_reconfirm'), ...Array(awaiting).fill('awaiting')];
const setCounts = (...n: [number, number, number, number]) => {
  mockRsvps = statuses(...n).map((status, i) => ({ user_id: people[i], status }));
};

beforeEach(() => {
  mockPush.mockReset();
  mockRespond.mockReset();
  mockStart = '2099-11-14T16:00:00Z';
  mockPlan = { id: 'p1', experience_name: 'Barton Springs', organizer_id: 'maya', state: 'sent', cancel_reason: null, current_revision: 1 };
  setCounts(1, 5, 0, 0);
});

const show = (viewer: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <PlanScreen planId="p1" viewerId={viewer} />
</QueryClientProvider>);
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

test('the P0-13 count sequence always adds up to six, and updates live', async () => {
  await show('maya');
  expect(await screen.findByText('1 going · 5 awaiting reply · 0 can’t go · 0 need to reconfirm')).toBeTruthy();
  const steps: [number, number, number, number][] = [[3, 3, 0, 0], [3, 2, 1, 0], [1, 2, 1, 2], [2, 2, 1, 1], [2, 2, 2, 0]];
  for (const step of steps) {
    setCounts(...step);
    await act(async () => { mockOnChange(); });
    const [g, a, c, r] = step;
    expect(g + a + c + r).toBe(6);
    expect(await screen.findByText(`${g} going · ${a} awaiting reply · ${c} can’t go · ${r} need to reconfirm`)).toBeTruthy();
  }
});

test('details name the zone and booking; each invitee has a status in words', async () => {
  await show('jordan');
  expect(await screen.findByText('Austin time (CST)')).toBeTruthy();
  expect(screen.getByText('Booking required. Each person books their own spot.')).toBeTruthy();
  expect(screen.getByLabelText('Maya, organizer: Going')).toBeTruthy();
  expect(screen.getByLabelText('Jordan: Awaiting reply')).toBeTruthy();
});

test('answering is not optimistic: a failure keeps the old answer and says so', async () => {
  mockRespond.mockRejectedValueOnce(new Error('Network request failed'));
  await show('jordan');
  expect(await screen.findByText('Your answer: Awaiting reply')).toBeTruthy();
  await tap('Going');
  expect(mockRespond).toHaveBeenCalledWith({ plan_id: 'p1', revision: 1, status: 'going' });
  expect(screen.getByText(/Your previous answer still stands/)).toBeTruthy();
  expect(screen.getByText('Your answer: Awaiting reply')).toBeTruthy();

  mockRespond.mockResolvedValueOnce({ data: null, error: null });
  mockRsvps[1].status = 'going';
  await tap('Going');
  expect(await screen.findByText('Your answer: Going')).toBeTruthy();
});

test('a stale revision says the plan changed', async () => {
  mockRespond.mockResolvedValueOnce({ data: null, error: { message: 'stale_revision' } });
  await show('jordan');
  await screen.findByText('Your answer: Awaiting reply');
  await tap('Can’t go');
  expect(screen.getByText('This plan just changed. Check the new details and answer again.')).toBeTruthy();
});

test('the organizer has no Can’t go button', async () => {
  await show('maya');
  expect(await screen.findByText('You’re organizing, so you’re going.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Can’t go' })).toBeNull();
});

test('someone not invited sees that the plan isn’t available', async () => {
  mockPlan = null;
  await show('stranger');
  expect(await screen.findByText('This plan isn’t available to you')).toBeTruthy();
});

test('after the start time, answers are locked', async () => {
  mockStart = '2020-01-01T16:00:00Z';
  await show('jordan');
  expect(await screen.findByText('This plan has started, so answers are closed.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Going' })).toBeNull();
});

test('the organizer of a sent plan can cancel it', async () => {
  await show('maya');
  expect(await screen.findByRole('button', { name: 'Cancel plan' })).toBeTruthy();
});

test('an invitee cannot cancel a plan', async () => {
  await show('jordan');
  await screen.findByText('Who’s coming');
  expect(screen.queryByRole('button', { name: 'Cancel plan' })).toBeNull();
});

test('a cancelled plan says who cancelled and why, and closes answers and edits', async () => {
  mockPlan = { ...mockPlan, state: 'cancelled', cancel_reason: 'Weather', group_id: 'g1', experience_id: 'e1' };
  await show('jordan');
  await screen.findByText('Who’s coming', {}, { timeout: 3000 });
  expect(await screen.findByText('Maya cancelled this plan: Weather.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Going' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Can’t go' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Edit plan' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cancel plan' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start a new plan from it' })).toBeNull();
});

test('the organizer can start a new plan from a cancelled one, with a fresh draft', async () => {
  mockPlan = { ...mockPlan, state: 'cancelled', cancel_reason: 'Venue closed', group_id: 'g1', experience_id: 'e1' };
  await show('maya');
  await screen.findByText('Maya cancelled this plan: Venue closed.', {}, { timeout: 3000 });
  await tap('Start a new plan from it');
  expect(mockPush).toHaveBeenCalledWith('/plan/new?group=g1&experience=e1');
});

test('the organizer sees the invite tools; an invitee does not', async () => {
  await show('maya');
  expect(await screen.findByText('Invite more people')).toBeTruthy();
});

test('an invitee has no invite tools', async () => {
  await show('jordan');
  await screen.findByText('Who’s coming');
  expect(screen.queryByText('Invite more people')).toBeNull();
});
