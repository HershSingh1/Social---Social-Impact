import { beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { EXPERIENCES_KEY, type Experience } from '../../discovery/useExperiences';
import { buildAgainDraft, nextStart, priceChangedLine, repeatFailed, setRepeat, similarListings, type AgainSource, type Listing } from '../again';
import { PlanAgainScreen } from '../PlanAgainScreen';
import { PlanDraftScreen } from '../PlanDraftScreen';
import { loadDraft, type PlanDraft } from '../draft';
import type { Plan } from '../plan';
import { RepeatControl } from '../RepeatControl';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
let mockPlanRow: Record<string, unknown> | null;
let mockExperience: Record<string, unknown> | null;
let mockMembers: { user_id: string }[];
let mockRsvps: { user_id: string; status: string; revision: number }[];
let mockFail = false;
let mockPrice: Record<string, unknown>;
function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order']) b[m] = () => b;
  const result = (): Result => {
    if (mockFail) return { data: null, error: { message: 'Network request failed' } };
    if (table === 'plans') return { data: mockPlanRow, error: null };
    if (table === 'plan_revisions') return { data: [{ revision: 1, start_at: '2026-11-14T20:00:00Z', end_at: '2026-11-14T22:00:00Z',
      meeting_point: 'South gate', note: 'Bring a hat', price_snapshot: mockPrice, booking_required: false }], error: null };
    if (table === 'rsvps') return { data: mockRsvps, error: null };
    if (table === 'group_members') return { data: mockMembers, error: null };
    return { data: mockExperience, error: null };
  };
  b.maybeSingle = async () => result();
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(result()).then(resolve);
  return b;
}
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: (fn: string, args: Record<string, unknown>) => fn === 'get_profile_cards'
    ? Promise.resolve({ data: ['maya', 'jordan', 'sam', 'priya'].map(id => ({ user_id: id, display_name: id[0].toUpperCase() + id.slice(1) })), error: null })
    : mockRpc(fn, args),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/datetimepicker', () => () => null);
let mockKey = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKey}` }));

const wrap = (node: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const exp = (id: string, name: string, over: Partial<Experience> = {}): Experience => ({ id, name, category: 'Art and walks', description: '', lat: null, lng: null,
  area: null, image_url: null, timing_kind: 'flexible', hours_text: null, booking_required: false, price_kind: 'exact', price_min: 30, price_max: 30, ...over });

beforeEach(async () => {
  mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: null, error: null });
  mockKey = 0; mockFail = false;
  mockPrice = { kind: 'exact', min: 30, max: 30 };
  mockPlanRow = { id: 'p1', experience_name: 'Sketch and stroll', organizer_id: 'maya', state: 'sent', cancel_reason: null, current_revision: 1,
    group_id: 'g1', experience_id: 'e1', updated_at: '2026-11-01T00:00:00Z', repeat_rule: null };
  mockExperience = { id: 'e1', name: 'Sketch and stroll', status: 'published', meeting_point: 'Main gate', address: null, duration_min: 120,
    price_kind: 'exact', price_min: 38, price_max: 38, hours_text: 'Fri to Sun', timing_kind: 'flexible', booking_required: false, sessions: null };
  mockMembers = [{ user_id: 'maya' }, { user_id: 'jordan' }, { user_id: 'sam' }, { user_id: 'priya' }];
  mockRsvps = [{ user_id: 'maya', status: 'going', revision: 1 }, { user_id: 'jordan', status: 'going', revision: 1 }, { user_id: 'sam', status: 'cant_go', revision: 1 }];
  await AsyncStorage.clear();
});

test('the next start keeps the weekday and clock time across a DST change', () => {
  // Sat Oct 31 2026, 2:00 PM CDT (19:00Z). The next Saturday, Nov 7, is CST: still 2:00 PM, now 20:00Z.
  expect(nextStart('2026-10-31T19:00:00Z', null, Date.parse('2026-11-01T00:00:00Z')).toISOString()).toBe('2026-11-07T20:00:00.000Z');
  expect(nextStart('2026-11-14T20:00:00Z', 'every_2_weeks', Date.parse('2026-11-15T00:00:00Z')).toISOString()).toBe('2026-11-28T20:00:00.000Z');
  // Past dates are skipped until one is in the future.
  expect(nextStart('2026-11-14T20:00:00Z', 'weekly', Date.parse('2026-12-01T00:00:00Z')).toISOString()).toBe('2026-12-05T20:00:00.000Z');
});

test('a monthly step from the 31st lands on the last day of a shorter month; a skipped DST hour moves a week on', () => {
  expect(nextStart('2027-01-31T20:00:00Z', 'monthly', Date.parse('2027-02-01T00:00:00Z')).toISOString()).toBe('2027-02-28T20:00:00.000Z');
  // Sun Mar 1 2026, 2:30 AM CST (08:30Z). Mar 8 2:30 AM does not exist, so the next one is Mar 15.
  expect(nextStart('2026-03-01T08:30:00Z', null, Date.parse('2026-03-02T00:00:00Z')).toISOString()).toBe('2026-03-15T07:30:00.000Z');
});

test('the price line is exact, and absent when nothing changed', () => {
  expect(priceChangedLine({ kind: 'exact', min: 30, max: 30 }, { kind: 'exact', min: 38, max: 38 })).toBe('Price changed from $30 to $38');
  expect(priceChangedLine({ kind: 'exact', min: 30, max: 30 }, { kind: 'free', min: 0, max: 0 })).toBe('Price changed from $30 to Free');
  expect(priceChangedLine({ kind: 'exact', min: 30, max: 30 }, { kind: 'exact', min: 30, max: 30 })).toBeNull();
});

test('three similar activities by price, never the removed one', () => {
  const catalog = [exp('a', 'A', { price_min: 5, price_max: 5 }), exp('b', 'B', { price_min: 28, price_max: 28 }), exp('c', 'C', { price_min: 33, price_max: 33 }),
    exp('d', 'D', { price_min: 31, price_max: 31 }), exp('e', 'E', { price_kind: 'unknown', price_min: null, price_max: null })];
  expect(similarListings(catalog, { kind: 'exact', min: 30, max: 30 }).map(e => e.id)).toEqual(['d', 'b', 'c']);
  expect(similarListings(catalog, { kind: 'exact', min: 30, max: 30 }, 'd').map(e => e.id)).toEqual(['b', 'c', 'a']);
});

const plan = (over: Partial<Plan> = {}): Plan => ({ id: 'p1', name: 'Sketch and stroll', organizerId: 'maya', state: 'sent', cancelReason: null, groupId: 'g1', experienceId: 'e1',
  updatedAt: '2026-11-01T00:00:00Z', repeatRule: null,
  current: { revision: 1, startAt: '2026-11-14T20:00:00Z', endAt: '2026-11-14T22:00:00Z', meetingPoint: 'South gate', note: 'Bring a hat',
    price: { kind: 'exact', min: 30, max: 30 }, bookingRequired: false },
  revisions: [],
  invitees: [{ userId: 'maya', name: 'Maya', status: 'going', isOrganizer: true, answeredRevision: 1 }, { userId: 'jordan', name: 'Jordan', status: 'going', isOrganizer: false, answeredRevision: 1 },
    { userId: 'sam', name: 'Sam', status: 'cant_go', isOrganizer: false, answeredRevision: 1 }, { userId: 'gone', name: 'Gone', status: 'going', isOrganizer: false, answeredRevision: 1 }],
  ...over });
const listing: Listing = { id: 'e1', name: 'Sketch and stroll', meetingPoint: 'Main gate', durationMin: 120, price: { kind: 'exact', min: 38, max: 38 } };
const NOW = Date.parse('2026-11-15T00:00:00Z');

test('the draft keeps the activity, the people still in the group and the time of day; no answers or notes carry over', () => {
  const src: AgainSource = { plan: plan(), groupId: 'g1', members: ['maya', 'jordan', 'sam', 'priya'] };
  const d = buildAgainDraft(src, listing, 'jordan', { now: NOW });
  expect(d.experienceId).toBe('e1');
  expect(d.start).toBe('2026-11-21T20:00:00.000Z');
  expect(new Date(d.end).getTime() - new Date(d.start).getTime()).toBe(2 * 3_600_000);
  expect(d.recipients.sort()).toEqual(['maya', 'sam']); // the old organizer comes along; Priya was not invited; Gone left the group
  expect(d.note).toBe('');
  expect(d.meetingPoint).toBe('Main gate');
  expect(d.again).toEqual({ planId: 'p1', name: 'Sketch and stroll', fromStart: '2026-11-14T20:00:00Z', priceNote: 'Price changed from $30 to $38' });
});

test('from the reminder the repeat rule sets the date and is remembered; a replacement activity has no price note', () => {
  const src: AgainSource = { plan: plan({ repeatRule: 'every_2_weeks' }), groupId: 'g1', members: ['maya', 'jordan'] };
  const d = buildAgainDraft(src, { ...listing, price: { kind: 'exact', min: 30, max: 30 } }, 'maya', { reminder: true, now: NOW });
  expect(d.start).toBe('2026-11-28T20:00:00.000Z');
  expect(d.again?.reminderRule).toBe('every_2_weeks');
  expect(d.again?.priceNote).toBeNull();
  const other = buildAgainDraft(src, { ...listing, id: 'e2', name: 'Pottery' }, 'maya', { now: NOW });
  expect(other.again?.priceNote).toBeNull();
});

test('set_repeat sends the rule or null; refusals are put in words', async () => {
  await setRepeat('p1', 'monthly'); await setRepeat('p1', null);
  expect(mockRpc.mock.calls).toEqual([['set_repeat', { plan_id: 'p1', rule: 'monthly' }], ['set_repeat', { plan_id: 'p1', rule: null }]]);
  expect(repeatFailed({ message: 'not_organizer' })).toMatch(/Only the person who made this plan/);
  expect(repeatFailed({ message: 'plan_cancelled' })).toMatch(/cancelled/);
  expect(repeatFailed({ message: 'Network request failed' })).toBe('Couldn’t save. Try again.');
});

const show = (over: { reminder?: boolean } = {}, onReady = jest.fn(), onClose = jest.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(EXPERIENCES_KEY, [exp('e2', 'Watercolor in the park', { price_min: 22, price_max: 22 }), exp('e3', 'Clay and conversation', { price_min: 35, price_max: 35 }),
    exp('e4', 'Museum late night', { price_kind: 'free', price_min: 0, price_max: 0 }), exp('e5', 'Escape room', { price_min: 80, price_max: 80 })]);
  return render(wrap(<PlanAgainScreen planId="p1" viewerId="jordan" reminder={over.reminder} onReady={onReady} onClose={onClose} />, client));
};

test('Plan again shows Loading, saves the draft on the phone once and opens it', async () => {
  const onReady = jest.fn();
  await show({}, onReady);
  expect(screen.getByText('Getting today’s price and hours…')).toBeTruthy();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledWith('/plan/new?group=g1&experience=e1');
  const saved = await loadDraft({ groupId: 'g1', experienceId: 'e1' });
  expect(saved?.again?.priceNote).toBe('Price changed from $30 to $38');
  expect(saved?.clientKey).toBe('key-1');
  expect(mockRpc).not.toHaveBeenCalled(); // nothing is created on the server
});

test('a failed build creates nothing and offers Try again', async () => {
  mockFail = true;
  const onReady = jest.fn();
  await show({}, onReady);
  expect(await screen.findByText(/Nothing was created/)).toBeTruthy();
  mockFail = false;
  await press('Try again');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('a removed activity says so and offers three similar ones; Choose opens a draft for it with the same people', async () => {
  mockPlanRow = { ...mockPlanRow!, experience_id: null };
  const onReady = jest.fn(); const onClose = jest.fn();
  await show({}, onReady, onClose);
  expect(await screen.findByText('Sketch and stroll isn’t listed any more. Pick a similar activity to keep planning.')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Choose / })).toHaveLength(3);
  expect(screen.queryByText('Escape room')).toBeNull();
  expect(onReady).not.toHaveBeenCalled();
  mockExperience = { id: 'e2', name: 'Watercolor in the park', status: 'published', meeting_point: 'Pavilion', address: null, duration_min: 90,
    price_kind: 'exact', price_min: 22, price_max: 22 };
  await press('Choose Watercolor in the park');
  expect(onReady).toHaveBeenCalledWith('/plan/new?group=g1&experience=e2');
  const saved = await loadDraft({ groupId: 'g1', experienceId: 'e2' });
  expect(saved?.meetingPoint).toBe('Pavilion');
  expect(saved?.recipients.sort()).toEqual(['maya', 'sam']);
  await act(async () => {});
  await press('Not now');
  expect(onClose).toHaveBeenCalled();
});

const draftWith = async (again: PlanDraft['again']) => {
  const d: PlanDraft = { groupId: 'g1', experienceId: 'e1', clientKey: 'k', start: '2099-11-21T20:00:00.000Z', end: '2099-11-21T22:00:00.000Z',
    meetingPoint: 'Main gate', note: '', recipients: ['jordan'], again };
  await AsyncStorage.setItem('sidequest.planDraft:g1:e1:-', JSON.stringify(d));
};
const draftScreen = () => render(wrap(<PlanDraftScreen source={{ groupId: 'g1', experienceId: 'e1' }} organizerId="maya" onSent={() => {}} />));

test('the draft says where it was copied from and warns about a price change before sending', async () => {
  await draftWith({ planId: 'p1', name: 'Sketch and stroll', fromStart: '2026-11-14T20:00:00Z', priceNote: 'Price changed from $30 to $38' });
  await draftScreen();
  expect(await screen.findByText(/Copied from Sat, Nov 14/)).toBeTruthy();
  expect(screen.getByText('Price changed from $30 to $38. Check it before you send.')).toBeTruthy();
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
});

test('from the reminder the draft says nothing changed, and Stop repeating clears the rule', async () => {
  await draftWith({ planId: 'p1', name: 'Sketch and stroll', fromStart: '2026-11-14T20:00:00Z', priceNote: null, reminderRule: 'every_2_weeks' });
  await draftScreen();
  expect(await screen.findByText('Time to plan again.')).toBeTruthy();
  expect(screen.getByText('Sketch and stroll repeats every 2 weeks. Review the details, then send. Nothing is sent until you do.')).toBeTruthy();
  expect(screen.getByText('No changes since last time')).toBeTruthy();
  await press('Stop repeating');
  expect(mockRpc).toHaveBeenCalledWith('set_repeat', { plan_id: 'p1', rule: null });
  expect(screen.queryByText('Time to plan again.')).toBeNull();
});

test('Repeat: shows the current choice, saves the new one, and a failure keeps the old choice', async () => {
  const onSaved = jest.fn();
  await render(wrap(<RepeatControl planId="p1" rule="weekly" onSaved={onSaved} />));
  expect(screen.getByText('Every week')).toBeTruthy();
  await press(/^Repeat, Every week/);
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Every month' })));
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await press('Save');
  expect(screen.getByText('Couldn’t save. Try again.')).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /^Repeat, Every week/ })).toBeTruthy(); // still the saved choice
  await press('Save');
  expect(mockRpc).toHaveBeenLastCalledWith('set_repeat', { plan_id: 'p1', rule: 'monthly' });
  expect(onSaved).toHaveBeenCalled();
});

test('Repeat can be cleared with Doesn’t repeat', async () => {
  await render(wrap(<RepeatControl planId="p1" rule="monthly" onSaved={() => {}} />));
  await press(/^Repeat, Every month/);
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Doesn’t repeat' })));
  await press('Save');
  expect(mockRpc).toHaveBeenLastCalledWith('set_repeat', { plan_id: 'p1', rule: null });
});
