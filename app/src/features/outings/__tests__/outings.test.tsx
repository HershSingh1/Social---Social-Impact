import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { OutingPrompts } from '../OutingPrompts';
import { PastOutings } from '../PastOutings';
import { outingBadges, promptOpen, saveFailed, type PastOuting } from '../outings';

type Result = { data: unknown; error: { message: string } | null };
let mockReport: string | null;
let mockAttended: string | null;
let mockHistory: Result;
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) b[m] = () => b;
  b.maybeSingle = async () => ({ error: null, data: table === 'outing_reports'
    ? (mockReport ? { organizer_status: mockReport } : null) : (mockAttended ? { attended: mockAttended } : null) });
  return b;
}
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
} }));

const END = '2026-11-14T22:00:00Z';
const AFTER_2H = Date.parse('2026-11-15T00:00:01Z');
const wrap = (node: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>;
const reports = () => mockRpc.mock.calls.filter(([fn]) => fn === 'report_outing' || fn === 'report_attendance');
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const showPrompts = (over: Partial<Parameters<typeof OutingPrompts>[0]> = {}) => render(wrap(
  <OutingPrompts planId="p1" planName="Sketch and stroll" userId="me" endAt={END} now={AFTER_2H} isOrganizer isGoing {...over} />));

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async fn => fn === 'group_history' ? mockHistory : { data: null, error: null });
  mockReport = null; mockAttended = null; mockHistory = { data: [], error: null };
});

test('prompts open two hours after the end, not before', () => {
  expect(promptOpen(END, Date.parse('2026-11-14T23:59:59Z'))).toBe(false);
  expect(promptOpen(END, Date.parse('2026-11-15T00:00:00Z'))).toBe(true);
});

test('server refusals are put in words and anything else gets the generic line', () => {
  expect(saveFailed(new Error('too_early'))).toMatch(/2 hours after the plan ends/);
  expect(saveFailed(new Error('not_going'))).toMatch(/said Going/);
  expect(saveFailed({ message: 'too_early' })).toMatch(/2 hours/);
  expect(saveFailed(new Error('Network request failed'))).toBe('Couldn’t save your answer. Try again.');
});

test('before the prompt window opens nothing is shown and nothing is read', async () => {
  await showPrompts({ now: Date.parse('2026-11-14T23:00:00Z') });
  expect(screen.queryByText(/Did .* happen\?/)).toBeNull();
  expect(screen.queryByText('Did you go?')).toBeNull();
});

test('the organizer is asked, and Happened sends report_outing once', async () => {
  await showPrompts({ isGoing: false });
  expect(await screen.findByText('Did Sketch and stroll happen?')).toBeTruthy();
  expect(screen.queryByText('Did you go?')).toBeNull();
  await press('Happened');
  expect(reports()).toEqual([['report_outing', { plan_id: 'p1', status: 'happened' }]]);
});

test('Didn’t happen and Not sure send their own value', async () => {
  await showPrompts({ isGoing: false });
  await screen.findByText('Did Sketch and stroll happen?');
  await press('Didn’t happen');
  await press('Not sure');
  expect(reports().map(([, a]) => a.status)).toEqual(['didnt_happen', 'not_sure']);
});

test('a refused answer says why under the buttons and keeps the prompt', async () => {
  await showPrompts({ isGoing: false });
  await screen.findByText('Did Sketch and stroll happen?');
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'too_early' } });
  await press('Happened');
  expect(screen.getByText(/too early to answer/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Happened' })).toBeTruthy();
});

test('an organizer who already answered sees it in words with Change, and can switch', async () => {
  mockReport = 'happened';
  await showPrompts({ isGoing: false });
  expect(await screen.findByText('✓ You said it happened')).toBeTruthy();
  expect(screen.queryByText('Did Sketch and stroll happen?')).toBeNull();
  await press(/Change your answer about whether it happened/);
  expect(screen.getByText('If it didn’t happen, it leaves the group’s outing count.')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Didn’t happen' })));
  expect(reports()).toEqual([['report_outing', { plan_id: 'p1', status: 'didnt_happen' }]]);
});

test('a person who said Going is asked Did you go?; Yes and No send report_attendance', async () => {
  await showPrompts({ isOrganizer: false });
  expect(await screen.findByText('Did you go?')).toBeTruthy();
  expect(screen.queryByText(/Did .* happen\?/)).toBeNull();
  await press('Yes');
  await press('No');
  expect(reports()).toEqual([
    ['report_attendance', { plan_id: 'p1', attended: 'yes' }],
    ['report_attendance', { plan_id: 'p1', attended: 'no' }],
  ]);
});

test('Skip stores nothing and puts the prompt away', async () => {
  await showPrompts({ isOrganizer: false });
  await screen.findByText('Did you go?');
  await press(/Skip/);
  expect(reports()).toHaveLength(0);
  expect(screen.queryByText('Did you go?')).toBeNull();
});

test('someone who did not say Going is not asked', async () => {
  await showPrompts({ isOrganizer: false, isGoing: false });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); // let the answers load
  expect(screen.queryByText('Did you go?')).toBeNull();
});

test('after answering, the prompt is a status in words with Change', async () => {
  mockAttended = 'yes';
  await showPrompts({ isOrganizer: false });
  expect(await screen.findByText('✓ You went')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  await press(/Change your attendance answer/);
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'No, I didn’t go' })));
  expect(reports()).toEqual([['report_attendance', { plan_id: 'p1', attended: 'no' }]]);
});

const row = (over: Partial<PastOuting>): PastOuting => ({ planId: 'x', name: 'Bowling', startAt: '2026-10-17T20:00:00Z', cancelled: false,
  organizerStatus: null, youWent: null, countsAsOuting: false, ...over });

test('labels: Planned, the organizer’s word, You went, and Cancelled', () => {
  expect(outingBadges(row({})).map(b => b.label)).toEqual(['Planned']);
  expect(outingBadges(row({ organizerStatus: 'happened', youWent: true }), 'Maya').map(b => b.label)).toEqual(['Maya says it happened', 'You went']);
  expect(outingBadges(row({ organizerStatus: 'didnt_happen' }), 'Maya').map(b => b.label)).toEqual(['Maya says it didn’t happen']);
  expect(outingBadges(row({ organizerStatus: 'happened' })).map(b => b.label)).toEqual(['The organizer says it happened']);
  expect(outingBadges(row({ cancelled: true, organizerStatus: 'happened', youWent: true })).map(b => b.label)).toEqual(['Cancelled']);
});

const history = (rows: Record<string, unknown>[]): Result => ({ data: rows, error: null });
const h = (over: Record<string, unknown>) => ({ plan_id: 'p', activity_name: 'Bowling', start_at: '2026-10-17T20:00:00Z', end_at: '2026-10-17T22:00:00Z',
  time_zone: 'America/Chicago', cancelled: false, organizer_status: null, you_went: null, going_count: 3, attended_count: 0, counts_as_outing: false, ...over });

test('Past outings: loading, then rows newest first with the happened count, cancelled ones not counted', async () => {
  mockHistory = history([
    h({ plan_id: 'a', activity_name: 'Sketch and stroll', start_at: '2026-11-14T20:00:00Z', organizer_status: 'happened', you_went: true, counts_as_outing: true }),
    h({ plan_id: 'b', activity_name: 'Clay and conversation', start_at: '2026-11-07T20:00:00Z' }),
    h({ plan_id: 'c', activity_name: 'Gallery night', start_at: '2026-10-24T20:00:00Z', cancelled: true, organizer_status: 'happened' }),
  ]);
  await render(wrap(<PastOutings groupId="g1" />));
  expect(screen.getByText('Loading past outings…')).toBeTruthy();
  expect(await screen.findByText('Sketch and stroll')).toBeTruthy();
  expect(screen.getByText('1 happened')).toBeTruthy();
  expect(screen.getByText('Sat, Nov 14')).toBeTruthy();
  expect(screen.getByText('The organizer says it happened')).toBeTruthy();
  expect(screen.getByText('You went')).toBeTruthy();
  expect(screen.getByText('Planned')).toBeTruthy();
  expect(screen.getByText('Cancelled')).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith('group_history', { group_id: 'g1' });
});

test('Past outings: empty state', async () => {
  await render(wrap(<PastOutings groupId="g1" />));
  expect(await screen.findByText('No past outings yet')).toBeTruthy();
  expect(screen.getByText('Plans that have ended show up here.')).toBeTruthy();
});

test('Past outings: an error says so, Try again reloads', async () => {
  mockHistory = { data: null, error: { message: 'boom' } };
  await render(wrap(<PastOutings groupId="g1" />));
  expect(await screen.findByText('Couldn’t load past outings.')).toBeTruthy();
  mockHistory = history([h({ activity_name: 'Bowling' })]);
  await press('Try again');
  expect(await screen.findByText('Bowling')).toBeTruthy();
});
