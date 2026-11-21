import { beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { addToCalendar, askAccess, CalendarDenied, CalendarGone, loadSaved, planEvent, staleKind, updateInCalendar, writableCalendars,
  type SavedEvent } from '../addToCalendar';
import { AddToCalendarButton, CalendarUpdateNotice } from '../PlanCalendar';
import type { Plan, Revision } from '../../plans/plan';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

type Details = Record<string, unknown>;
const mockAsk = jest.fn<() => Promise<{ granted: boolean }>>();
const mockCalendars = jest.fn<() => Promise<{ id: string; title: string; allowsModifications: boolean }[]>>();
const mockCreate = jest.fn<(details: Details) => Promise<{ id: string }>>();
const mockUpdate = jest.fn<(details: Details) => Promise<void>>();
const mockGetEvent = jest.fn<(id: string) => Promise<{ update: typeof mockUpdate }>>();
const mockGetCalendar = jest.fn<(id: string) => Promise<{ createEvent: typeof mockCreate }>>();
jest.mock('expo-calendar', () => ({
  requestCalendarPermissions: () => mockAsk(),
  getCalendars: () => mockCalendars(),
  EntityTypes: { EVENT: 'event' },
  ExpoCalendar: { get: (id: string) => mockGetCalendar(id) },
  ExpoCalendarEvent: { get: (id: string) => mockGetEvent(id) },
}));

const rev = (over: Partial<Revision> = {}): Revision => ({ revision: 1, startAt: '2026-11-21T20:00:00Z', endAt: '2026-11-21T22:00:00Z',
  meetingPoint: 'Mueller Lake, north dock', note: null, price: { kind: 'exact', min: 18, max: 18 }, bookingRequired: null, ...over });
const plan = (over: Partial<Plan> = {}, current: Partial<Revision> = {}): Plan => ({ id: 'p1', name: 'Sketch and stroll', organizerId: 'maya', state: 'sent',
  cancelReason: null, groupId: 'g1', experienceId: 'e1', updatedAt: '2026-11-19T00:00:00Z', current: rev(current), revisions: [], invitees: [], ...over });
const saved = (over: Partial<SavedEvent> = {}): SavedEvent => ({ eventId: 'ev1', calendarId: 'home', calendarTitle: 'Home',
  startAt: '2026-11-21T20:00:00Z', endAt: '2026-11-21T22:00:00Z', meetingPoint: 'Mueller Lake, north dock', cancelled: false, ...over });
const stored = (s: SavedEvent) => AsyncStorage.setItem('sidequest.calendarEvent.me.p1', JSON.stringify(s));

const wrap = (node: React.ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>;
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const m of [mockAsk, mockCalendars, mockCreate, mockUpdate, mockGetEvent, mockGetCalendar]) m.mockReset();
  mockAsk.mockResolvedValue({ granted: true });
  mockCalendars.mockResolvedValue([{ id: 'home', title: 'Home', allowsModifications: true }, { id: 'work', title: 'Work', allowsModifications: true }]);
  mockCreate.mockResolvedValue({ id: 'ev-new' });
  mockUpdate.mockResolvedValue();
  mockGetEvent.mockResolvedValue({ update: mockUpdate });
  mockGetCalendar.mockResolvedValue({ createEvent: mockCreate });
});

// --- the rules ---

test('the event has the title, time, meeting point, a link back and the plan’s time zone', () => {
  expect(planEvent(plan())).toEqual({
    title: 'Sketch and stroll', startDate: new Date('2026-11-21T20:00:00Z'), endDate: new Date('2026-11-21T22:00:00Z'),
    timeZone: 'America/Chicago', location: 'Mueller Lake, north dock', url: 'sidequest://plan/p1',
    notes: expect.stringMatching(/one-time copy/),
  });
});

test('a cancelled plan is kept in the calendar, retitled', () => {
  expect(planEvent(plan({ state: 'cancelled' })).title).toBe('Cancelled: Sketch and stroll');
});

test('the copy is stale only for a new time, a new meeting point or a cancellation', () => {
  expect(staleKind(null, plan())).toBeNull();
  expect(staleKind(saved(), plan())).toBeNull();
  expect(staleKind(saved(), plan({}, { revision: 2, startAt: '2026-11-21T21:00:00Z', endAt: '2026-11-21T23:00:00Z' }))).toBe('time');
  expect(staleKind(saved(), plan({}, { revision: 2, meetingPoint: 'South dock' }))).toBe('place');
  expect(staleKind(saved(), plan({}, { revision: 2, price: { kind: 'exact', min: 25, max: 25 } }))).toBeNull();
  expect(staleKind(saved(), plan({ state: 'cancelled' }))).toBe('cancelled');
  expect(staleKind(saved({ cancelled: true }), plan({ state: 'cancelled' }))).toBeNull();
});

test('the same instant in another format is not a change', () => {
  expect(staleKind(saved(), plan({}, { startAt: '2026-11-21T20:00:00.000Z', endAt: '2026-11-21T22:00:00.000+00:00' }))).toBeNull();
});

test('only calendars that can be written to are offered', async () => {
  mockCalendars.mockResolvedValue([{ id: 'home', title: 'Home', allowsModifications: true }, { id: 'hol', title: 'US Holidays', allowsModifications: false }]);
  expect(await writableCalendars()).toEqual([{ id: 'home', title: 'Home' }]);
});

test('asking for access reports denied in one word', async () => {
  mockAsk.mockResolvedValue({ granted: false });
  expect(await askAccess()).toBe('denied');
});

test('adding writes one event to the chosen calendar and keeps its id on the phone', async () => {
  const result = await addToCalendar('me', plan(), { id: 'work', title: 'Work' });
  expect(mockGetCalendar).toHaveBeenCalledWith('work');
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ eventId: 'ev-new', calendarId: 'work', calendarTitle: 'Work', cancelled: false });
  expect(await loadSaved('me', 'p1')).toEqual(result);
});

test('the saved copy is per person, so another account on this phone has none', async () => {
  await addToCalendar('me', plan(), { id: 'home', title: 'Home' });
  expect(await loadSaved('someone-else', 'p1')).toBeNull();
});

test('updating moves the existing event and never adds a second one', async () => {
  const later = plan({}, { revision: 2, startAt: '2026-11-21T21:00:00Z', endAt: '2026-11-21T23:00:00Z' });
  const result = await updateInCalendar('me', later, saved());
  expect(mockGetEvent).toHaveBeenCalledWith('ev1');
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ startDate: new Date('2026-11-21T21:00:00Z') }));
  expect(mockCreate).not.toHaveBeenCalled();
  expect(result.replaced).toBe(false);
  expect(result.saved).toMatchObject({ eventId: 'ev1', startAt: '2026-11-21T21:00:00Z' });
  expect(staleKind(result.saved, later)).toBeNull();
});

test('updating after a cancellation retitles the event', async () => {
  await updateInCalendar('me', plan({ state: 'cancelled' }), saved());
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cancelled: Sketch and stroll' }));
});

test('an event the person deleted is added again to the same calendar, and the result says so', async () => {
  mockGetEvent.mockRejectedValue(new Error('not found'));
  const result = await updateInCalendar('me', plan({}, { meetingPoint: 'South dock' }), saved());
  expect(mockGetCalendar).toHaveBeenCalledWith('home');
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ replaced: true, saved: { eventId: 'ev-new', meetingPoint: 'South dock' } });
});

test('updating without calendar access is refused and changes nothing', async () => {
  mockAsk.mockResolvedValue({ granted: false });
  await expect(updateInCalendar('me', plan({}, { meetingPoint: 'South dock' }), saved())).rejects.toBeInstanceOf(CalendarDenied);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('if the calendar itself is gone the update says so instead of failing quietly', async () => {
  mockGetEvent.mockRejectedValue(new Error('not found'));
  mockGetCalendar.mockRejectedValue(new Error('no calendar'));
  await expect(updateInCalendar('me', plan({}, { meetingPoint: 'South dock' }), saved())).rejects.toBeInstanceOf(CalendarGone);
});

// --- the button and the sheets ---

test('nothing asks for calendar access until the person taps', async () => {
  await render(wrap(<AddToCalendarButton plan={plan()} userId="me" />));
  expect(await screen.findByRole('button', { name: 'Add to calendar' })).toBeTruthy();
  expect(screen.getByText('Adds a one-time copy to your calendar. It doesn’t change your answer.')).toBeTruthy();
  expect(mockAsk).not.toHaveBeenCalled();
});

test('tapping asks for access, lists the calendars, and Add writes the event and says where', async () => {
  await render(wrap(<AddToCalendarButton plan={plan()} userId="me" />));
  await screen.findByRole('button', { name: 'Add to calendar' });
  await press('Add to calendar');
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('checkbox', { name: 'Home' })).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Work' })));
  await press('Add to Work');
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/✓ Added to Work\./)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
  expect((await loadSaved('me', 'p1'))?.calendarId).toBe('work');
});

test('a failed add says so under the button and marks nothing as added', async () => {
  mockCreate.mockRejectedValue(new Error('boom'));
  await render(wrap(<AddToCalendarButton plan={plan()} userId="me" />));
  await screen.findByRole('button', { name: 'Add to calendar' });
  await press('Add to calendar');
  await screen.findByRole('checkbox', { name: 'Home' });
  await press('Add to Home');
  expect(await screen.findByText('Couldn’t add this to your calendar. Try again.')).toBeTruthy();
  expect(await loadSaved('me', 'p1')).toBeNull();
});

test('when access is denied the sheet says how to turn it on and the plan stays usable', async () => {
  mockAsk.mockResolvedValue({ granted: false });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(wrap(<AddToCalendarButton plan={plan()} userId="me" />));
  await screen.findByRole('button', { name: 'Add to calendar' });
  await press('Add to calendar');
  expect(await screen.findByText('Calendar is off for Sidequest.')).toBeTruthy();
  expect(screen.getByText(/The plan works without it/)).toBeTruthy();
  expect(mockCalendars).not.toHaveBeenCalled();
  await press('Open iPhone Settings');
  expect(open).toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('with no writable calendar the sheet explains instead of offering a dead button', async () => {
  mockCalendars.mockResolvedValue([]);
  await render(wrap(<AddToCalendarButton plan={plan()} userId="me" />));
  await screen.findByRole('button', { name: 'Add to calendar' });
  await press('Add to calendar');
  expect(await screen.findByText(/No calendar on this iPhone can take new events/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Add to (?!calendar)/ })).toBeNull();
});

test('a plan already added shows its status in words, not the button', async () => {
  await stored(saved());
  await render(wrap(<AddToCalendarButton plan={plan()} userId="me" />));
  expect(await screen.findByText(/✓ Added to Home\./)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
});

// --- the update notice ---

const changed = () => plan({}, { revision: 2, startAt: '2026-11-21T21:00:00Z', endAt: '2026-11-21T23:00:00Z' });

test('no notice when the plan was never added or still matches', async () => {
  const { rerender } = await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  await act(async () => {});
  expect(screen.queryByText(/Update it\?/)).toBeNull();
  await stored(saved());
  await rerender(wrap(<CalendarUpdateNotice plan={plan()} userId="me" />));
  await act(async () => {});
  expect(screen.queryByText(/Update it\?/)).toBeNull();
});

test('after a time change the notice has the exact words, and Update moves the same event', async () => {
  await stored(saved());
  await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  expect(await screen.findByText('Your calendar has the old time. Update it?')).toBeTruthy();
  await press('Update');
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(screen.queryByText('Your calendar has the old time. Update it?')).toBeNull();
  expect((await loadSaved('me', 'p1'))?.startAt).toBe('2026-11-21T21:00:00Z');
});

test('Not now hides the notice for this view without touching the calendar', async () => {
  await stored(saved());
  await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  await screen.findByText('Your calendar has the old time. Update it?');
  await press('Not now');
  expect(screen.queryByText('Your calendar has the old time. Update it?')).toBeNull();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('a cancelled plan says the calendar still has it, and Update retitles it', async () => {
  await stored(saved());
  await render(wrap(<CalendarUpdateNotice plan={plan({ state: 'cancelled' })} userId="me" />));
  expect(await screen.findByText('This plan was cancelled. Your calendar still has it. Update it?')).toBeTruthy();
  await press('Update');
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cancelled: Sketch and stroll' }));
});

test('a deleted event is replaced and the person is told', async () => {
  await stored(saved());
  mockGetEvent.mockRejectedValue(new Error('not found'));
  await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  await screen.findByText('Your calendar has the old time. Update it?');
  await press('Update');
  expect(await screen.findByText('Your old event was removed, so this added a new one.')).toBeTruthy();
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

test('a failed update says so under the button and keeps the notice', async () => {
  await stored(saved());
  mockUpdate.mockRejectedValue(new Error('boom'));
  await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  await screen.findByText('Your calendar has the old time. Update it?');
  await press('Update');
  expect(await screen.findByText('Couldn’t update your calendar. Try again.')).toBeTruthy();
  expect(screen.getByText('Your calendar has the old time. Update it?')).toBeTruthy();
});

test('updating after access was turned off opens the denied sheet', async () => {
  await stored(saved());
  mockAsk.mockResolvedValue({ granted: false });
  await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  await screen.findByText('Your calendar has the old time. Update it?');
  await press('Update');
  expect(await screen.findByText('Calendar is off for Sidequest.')).toBeTruthy();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('when the calendar is gone the notice says to add the plan again', async () => {
  await stored(saved());
  mockGetEvent.mockRejectedValue(new Error('not found'));
  mockGetCalendar.mockRejectedValue(new Error('no calendar'));
  await render(wrap(<CalendarUpdateNotice plan={changed()} userId="me" />));
  await screen.findByText('Your calendar has the old time. Update it?');
  await press('Update');
  expect(await screen.findByText(/That calendar is no longer on this iPhone/)).toBeTruthy();
  expect(await loadSaved('me', 'p1')).toBeNull();
});
