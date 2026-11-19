import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { OutingPrompts } from '../../outings/OutingPrompts';
import { PastOutings } from '../../outings/PastOutings';
import { OutingFeedback, SummaryLine } from '../OutingFeedback';
import { FeedbackSheet } from '../FeedbackSheet';
import { PreferencesScreen } from '../PreferencesScreen';
import { decodeNeeds, encodeNeeds, feedbackFailed, fetchSummary, summaryLine, validateFeedback, validatePrefs, EMPTY_PREFS } from '../feedback';

type Result = { data: unknown; error: { message: string } | null };
let mockFeedback: Record<string, unknown> | null;
let mockPrefs: Record<string, unknown> | null;
let mockPrefsError = false;
let mockSummary: Record<string, number>;
let mockAttended: string | null;
let mockHistory: unknown[];
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) b[m] = () => b;
  b.maybeSingle = async () => table === 'preferences' && mockPrefsError ? { error: { message: 'boom' }, data: null } : ({ error: null, data: table === 'feedback' ? mockFeedback : table === 'preferences' ? mockPrefs
    : table === 'attendance' ? (mockAttended ? { attended: mockAttended } : null) : null });
  return b;
}
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
} }));

const wrap = (node: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
const press = (name: string | RegExp, role: 'button' | 'checkbox' = 'button') => act(async () => fireEvent.press(screen.getByRole(role, { name })));
const calls = (fn: string) => mockRpc.mock.calls.filter(([f]) => f === fn);

beforeEach(() => {
  mockRpc.mockReset();
  mockPrefsError = false; mockFeedback = null; mockPrefs = null; mockAttended = null; mockHistory = [];
  mockSummary = { shared_count: 0, would_do_again: 0, maybe: 0, not_for_me: 0 };
  mockRpc.mockImplementation(async fn => fn === 'feedback_summary' ? { data: [mockSummary], error: null }
    : fn === 'group_history' ? { data: mockHistory, error: null } : { data: null, error: null });
});

test('the summary line is counts of people who shared, or says no one has', () => {
  expect(summaryLine({ sharedCount: 4, wouldDoAgain: 3, maybe: 1, notForMe: 0 })).toBe('3 of 4 who shared would do again');
  expect(summaryLine({ sharedCount: 0, wouldDoAgain: 0, maybe: 0, notForMe: 0 })).toBe('No one has shared feedback yet');
});

test('the summary is read from feedback_summary and holds only counts', async () => {
  mockSummary = { shared_count: 4, would_do_again: 3, maybe: 1, not_for_me: 0 };
  expect(await fetchSummary('p1')).toEqual({ sharedCount: 4, wouldDoAgain: 3, maybe: 1, notForMe: 0 });
  expect(mockRpc).toHaveBeenCalledWith('feedback_summary', { plan_id: 'p1' });
});

test('validation: a rating is needed and the reason stops at 280 characters', () => {
  expect(validateFeedback(null, '')).toEqual({ rating: 'Pick how it was.' });
  expect(validateFeedback('maybe', 'x'.repeat(281)).reason).toBe('Use 280 characters or fewer.');
  expect(validateFeedback('maybe', 'x'.repeat(280))).toEqual({});
});

test('server refusals are put in words; anything else says what you wrote is still here', () => {
  expect(feedbackFailed({ message: 'not_attended' })).toMatch(/said they went/);
  expect(feedbackFailed({ message: 'plan_cancelled' })).toMatch(/cancelled/);
  expect(feedbackFailed({ message: 'Network request failed' })).toBe('Couldn’t save your feedback. What you wrote is still here.');
});

test('accessibility needs round-trip through the single server text, chips and free text', () => {
  expect(encodeNeeds({ chips: ['Seating', 'Step-free access'], other: ' wheelchair ramp; no stairs ' })).toBe('Step-free access; Seating; wheelchair ramp; no stairs');
  expect(decodeNeeds('Step-free access; Seating; wheelchair ramp; no stairs')).toEqual({ chips: ['Step-free access', 'Seating'], other: 'wheelchair ramp; no stairs' });
  expect(decodeNeeds(null)).toEqual({ chips: [], other: '' });
  expect(validatePrefs({ ...EMPTY_PREFS, other: 'x'.repeat(301) })).toMatch(/300/);
  expect(validatePrefs({ ...EMPTY_PREFS, other: 'x'.repeat(300) })).toBeNull();
});

const sheet = (over: Partial<Parameters<typeof FeedbackSheet>[0]> = {}, onClose = jest.fn()) =>
  render(wrap(<FeedbackSheet planId="p1" planName="Sketch and stroll" userId="me" initial={null} visible onClose={onClose} {...over} />));

test('the sheet starts private; Save without a rating says so and sends nothing', async () => {
  await sheet();
  expect(screen.getByText('How was Sketch and stroll?')).toBeTruthy();
  expect(screen.getByText('Off: only you see this.')).toBeTruthy();
  expect(screen.getByLabelText('Share with group').props.value).toBe(false);
  await press('Save feedback');
  expect(screen.getByText('Pick how it was.')).toBeTruthy();
  expect(calls('set_feedback')).toHaveLength(0);
});

test('saving sends the rating, tags, reason and sharing once, and closes', async () => {
  const onClose = jest.fn();
  await sheet({}, onClose);
  await press('Maybe', 'checkbox');
  await press('Too pricey', 'checkbox');
  await press('Great for groups', 'checkbox');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Anything to add? (optional)'), ' Lovely spot, pricey supplies '));
  expect(screen.getByText('30 of 280')).toBeTruthy();
  await act(async () => fireEvent(screen.getByLabelText('Share with group'), 'valueChange', true));
  expect(screen.getByText(/the group sees only a count/)).toBeTruthy();
  expect(screen.getByText('On')).toBeTruthy();
  await press('Save feedback');
  expect(calls('set_feedback')).toEqual([['set_feedback', { plan_id: 'p1', rating: 'maybe', tags: ['Too pricey', 'Great for groups'], reason: 'Lovely spot, pricey supplies', shared: true }]]);
  expect(onClose).toHaveBeenCalled();
});

test('a failed save keeps everything typed and says so; Save again sends it', async () => {
  const onClose = jest.fn();
  await sheet({}, onClose);
  await press('Would do again', 'checkbox');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Anything to add? (optional)'), 'Great'));
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await press('Save feedback');
  expect(screen.getByText('Couldn’t save your feedback. What you wrote is still here.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Anything to add? (optional)').props.value).toBe('Great');
  await press('Save feedback');
  expect(calls('set_feedback')).toHaveLength(2);
  expect(calls('set_feedback')[1][1]).toMatchObject({ rating: 'would_do_again', reason: 'Great', shared: false });
  expect(onClose).toHaveBeenCalled();
});

test('changing feedback starts from what was saved', async () => {
  await sheet({ initial: { rating: 'not_for_me', tags: ['Too far'], reason: 'Hard to park', shared: true } });
  expect(screen.getByRole('checkbox', { name: 'Not for me' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'Too far' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Share with group').props.value).toBe(true);
});

test('the plan shows your feedback in words with Change and Delete, and the group count', async () => {
  mockFeedback = { rating: 'would_do_again', tags: [], reason: null, shared: false };
  mockSummary = { shared_count: 4, would_do_again: 3, maybe: 1, not_for_me: 0 };
  await render(wrap(<><OutingFeedback planId="p1" planName="Sketch and stroll" userId="me" open={false} onOpen={() => {}} /><SummaryLine planId="p1" /></>));
  expect(await screen.findByText('Would do again · Private')).toBeTruthy();
  expect(screen.getByText('YOUR FEEDBACK ON SKETCH AND STROLL')).toBeTruthy();
  expect(await screen.findByText('3 of 4 who shared would do again')).toBeTruthy();
  expect(screen.getByText('Only people who chose to share are counted. You never see who shared or why.')).toBeTruthy();
  await press('Delete my feedback');
  expect(mockRpc).toHaveBeenCalledWith('delete_feedback', { plan_id: 'p1' });
});

test('with no feedback yet the plan offers to rate it', async () => {
  const onOpen = jest.fn();
  await render(wrap(<OutingFeedback planId="p1" planName="Sketch and stroll" userId="me" open={false} onOpen={onOpen} />));
  await screen.findByRole('button', { name: 'Rate this outing' });
  await press('Rate this outing');
  expect(onOpen).toHaveBeenCalledWith(true);
});

test('saying Yes to Did you go? opens the feedback sheet, and Skip does not', async () => {
  const mount = () => render(wrap(<OutingPrompts planId="p1" planName="Sketch and stroll" userId="me" endAt="2026-11-14T22:00:00Z"
    now={Date.parse('2026-11-15T01:00:00Z')} isOrganizer={false} isGoing />));
  await mount();
  await screen.findByText('Did you go?');
  mockAttended = 'yes';
  await press('Yes');
  expect(await screen.findByText('How was Sketch and stroll?')).toBeTruthy();
});

test('Past outings rows carry the count line, cancelled ones do not, and the no-names note shows once', async () => {
  const row = (id: string, name: string, over: Record<string, unknown> = {}) => ({ plan_id: id, activity_name: name, start_at: '2026-11-14T20:00:00Z', end_at: '2026-11-14T22:00:00Z',
    time_zone: 'America/Chicago', cancelled: false, organizer_status: 'happened', you_went: null, going_count: 3, attended_count: 0, counts_as_outing: true, ...over });
  mockHistory = [row('a', 'Sketch and stroll'), row('b', 'Gallery night', { cancelled: true })];
  mockSummary = { shared_count: 4, would_do_again: 3, maybe: 1, not_for_me: 0 };
  await render(wrap(<PastOutings groupId="g1" />));
  expect(await screen.findByText('Sketch and stroll')).toBeTruthy();
  expect(await screen.findAllByText('3 of 4 who shared would do again')).toHaveLength(1);
  expect(screen.getAllByText('Only people who chose to share are counted. You never see who shared or why.')).toHaveLength(1);
  expect(mockRpc.mock.calls.filter(([fn]) => fn === 'feedback_summary')).toHaveLength(1);
});

test('Preferences: nothing set keeps Save dimmed; choosing days, times and needs saves them once', async () => {
  await render(wrap(<PreferencesScreen userId="me" />));
  expect(await screen.findByText('Only you can see this. It is never shown to your groups.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save preferences' }).props.accessibilityState.disabled).toBe(true);
  await press('Fri', 'checkbox'); await press('Sat', 'checkbox');
  await press('Evenings', 'checkbox');
  await press('Step-free access', 'checkbox');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Anything else (optional)'), 'near parking'));
  await press('Save preferences');
  expect(calls('set_preferences')).toEqual([['set_preferences', { preferred_days: ['fri', 'sat'], preferred_times: ['evening'], accessibility_needs: 'Step-free access; near parking' }]]);
  expect(screen.queryByText(/budget/i)).toBeNull();
});

test('Preferences: saved values load, Clear removes them, and a failed save keeps what was chosen', async () => {
  mockPrefs = { preferred_days: ['fri'], preferred_times: ['afternoon'], accessibility_needs: 'Seating; quiet corner' };
  await render(wrap(<PreferencesScreen userId="me" />));
  await screen.findByText('Days you prefer');
  expect(screen.getByRole('checkbox', { name: 'Fri' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'Seating' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Anything else (optional)').props.value).toBe('quiet corner');
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await press('Sat', 'checkbox');
  await press('Save preferences');
  expect(screen.getByText('Couldn’t save your preferences. What you chose is still here.')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Sat' }).props.accessibilityState.checked).toBe(true);
  await press('Clear all preferences');
  expect(calls('clear_preferences')).toHaveLength(1);
  expect(screen.getByText('Your preferences were cleared.')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Fri' }).props.accessibilityState.checked).toBe(false);
});

test('Preferences: a load error says so and Try again reloads', async () => {
  mockPrefsError = true;
  await render(wrap(<PreferencesScreen userId="me" />));
  expect(await screen.findByText('Couldn’t load your preferences.')).toBeTruthy();
  mockPrefsError = false;
  await press('Try again');
  expect(await screen.findByText('Days you prefer')).toBeTruthy();
});
