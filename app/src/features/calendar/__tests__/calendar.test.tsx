import { beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { myGroupsKey } from '../../groups/overview';
import { CalendarSettingsScreen } from '../CalendarSettingsScreen';
import { loadCounted, readEvents } from '../device';
import { answersFor, isBusy, type BusyEvent } from '../overlap';
import { prefillFromCalendar } from '../prefill';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
let mockShares: { group_id: string }[];
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
  from: () => ({ select: () => Promise.resolve({ data: mockShares, error: null }) }),
} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

let mockAccess: 'granted' | 'denied' | 'undetermined';
let mockCalendars: { id: string; title: string }[];
const mockListEvents = jest.fn<(ids: string[], from: Date, to: Date) => Promise<Record<string, unknown>[]>>();
jest.mock('expo-calendar', () => ({
  getCalendarPermissions: async () => ({ granted: mockAccess === 'granted', status: mockAccess }),
  requestCalendarPermissions: async () => { mockAccess = 'granted'; return { granted: true, status: 'granted' }; },
  getCalendars: async () => mockCalendars,
  listEvents: (ids: string[], from: Date, to: Date) => mockListEvents(ids, from, to),
  EntityTypes: { EVENT: 'event' }, Availability: { FREE: 'free', BUSY: 'busy' }, EventStatus: { CANCELED: 'canceled' },
}));
const mockOpenSettings = jest.fn();

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (p: string) => mockPush(p) } }));

const H = 3_600_000;
const T0 = Date.parse('2026-11-21T20:00:00Z'); // 2 PM Austin
const ev = (startH: number, endH: number, over: Partial<BusyEvent> = {}): BusyEvent => ({ start: T0 + startH * H, end: T0 + endH * H, free: false, canceled: false, ...over });

test('an event inside, across either edge, or around the time makes it busy', () => {
  expect(isBusy([ev(0.5, 1)], T0, T0 + 2 * H)).toBe(true);
  expect(isBusy([ev(-1, 0.5)], T0, T0 + 2 * H)).toBe(true);
  expect(isBusy([ev(1.5, 3)], T0, T0 + 2 * H)).toBe(true);
  expect(isBusy([ev(-3, 5)], T0, T0 + 2 * H)).toBe(true);
});

test('a time that only touches an event’s edge is free', () => {
  expect(isBusy([ev(-2, 0)], T0, T0 + 2 * H)).toBe(false);
  expect(isBusy([ev(2, 3)], T0, T0 + 2 * H)).toBe(false);
  expect(isBusy([], T0, T0 + 2 * H)).toBe(false);
});

test('all-day events count like any other, unless marked Free; cancelled events never count', () => {
  const allDay = { start: T0 - 14 * H, end: T0 + 10 * H };
  expect(isBusy([ev(0, 0, { ...allDay })], T0, T0 + 2 * H)).toBe(true);
  expect(isBusy([ev(0, 0, { ...allDay, free: true })], T0, T0 + 2 * H)).toBe(false);
  expect(isBusy([ev(0.5, 1, { canceled: true })], T0, T0 + 2 * H)).toBe(false);
  expect(isBusy([ev(0.5, 1, { free: true })], T0, T0 + 2 * H)).toBe(false);
});

test('a zero-length event counts only when it falls inside the time', () => {
  expect(isBusy([ev(1, 1)], T0, T0 + 2 * H)).toBe(true);
  expect(isBusy([ev(2, 2)], T0, T0 + 2 * H)).toBe(false);
});

test('one answer per proposed time, using its own length; a bad time is skipped', () => {
  const times = [{ optionId: 'a', startAt: new Date(T0).toISOString() }, { optionId: 'b', startAt: new Date(T0 + 5 * H).toISOString(), durationMin: 60 },
    { optionId: 'c', startAt: 'not a date' }];
  expect(answersFor(times, [ev(1.5, 1.75)])).toEqual([{ optionId: 'a', status: 'busy' }, { optionId: 'b', status: 'free' }]);
  expect(answersFor([{ optionId: 'a', startAt: new Date(T0).toISOString(), durationMin: 60 }], [ev(1.5, 1.75)])).toEqual([{ optionId: 'a', status: 'free' }]);
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (node: ReactNode, c = client()) => <QueryClientProvider client={c}>{node}</QueryClientProvider>;
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const shareCalls = () => mockRpc.mock.calls.filter(([fn]) => fn === 'set_calendar_share');
const group = (id: string, name: string) => ({ id, name, memberCount: 3, faces: [], next: 'Nothing planned yet' });

beforeEach(async () => {
  mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: null, error: null });
  mockListEvents.mockReset(); mockListEvents.mockResolvedValue([]);
  mockOpenSettings.mockReset(); mockPush.mockReset();
  jest.spyOn(Linking, 'openSettings').mockImplementation(async () => { mockOpenSettings(); });
  mockAccess = 'granted'; mockShares = [];
  mockCalendars = [{ id: 'home', title: 'Home' }, { id: 'work', title: 'Work' }, { id: 'bday', title: 'Birthdays' }];
  await AsyncStorage.clear();
});

test('reading events keeps only times and flags: a title, place or attendee never leaves the device layer', async () => {
  mockListEvents.mockResolvedValueOnce([{ title: 'Therapy', location: 'Dr. Lee', notes: 'secret', attendees: ['x'], startDate: '2026-11-21T20:30:00Z', endDate: '2026-11-21T21:00:00Z', availability: 'busy', status: 'confirmed' }]);
  const events = await readEvents(['home'], new Date(T0), new Date(T0 + 2 * H));
  expect(events).toEqual([{ start: Date.parse('2026-11-21T20:30:00Z'), end: Date.parse('2026-11-21T21:00:00Z'), free: false, canceled: false }]);
  expect(JSON.stringify(events)).not.toMatch(/Therapy|Lee|secret/);
});

const times = [{ optionId: 'o1', startAt: new Date(T0).toISOString() }, { optionId: 'o2', startAt: new Date(T0 + 24 * H).toISOString() }];
const sets = () => mockRpc.mock.calls.filter(([fn]) => fn === 'set_availability');

test('prefill writes calendar answers only with a share and access, and leaves hand answers alone', async () => {
  mockListEvents.mockResolvedValue([{ startDate: new Date(T0 + 0.5 * H), endDate: new Date(T0 + H), availability: 'busy', status: 'confirmed', title: 'Private' }]);
  expect(await prefillFromCalendar({ userId: 'me', shared: false, times, answered: new Set() })).toBe(0);
  mockAccess = 'denied';
  expect(await prefillFromCalendar({ userId: 'me', shared: true, times, answered: new Set() })).toBe(0);
  expect(sets()).toHaveLength(0);
  mockAccess = 'granted';
  expect(await prefillFromCalendar({ userId: 'me', shared: true, times, answered: new Set(['o2']) })).toBe(1);
  expect(sets()).toEqual([['set_availability', { option_id: 'o1', status: 'busy', source: 'calendar' }]]);
  expect(JSON.stringify(mockRpc.mock.calls)).not.toMatch(/Private/);
});

test('prefill reads only the calendars that count', async () => {
  await AsyncStorage.setItem('sidequest.calendar.counted.me', JSON.stringify(['work']));
  await prefillFromCalendar({ userId: 'me', shared: true, times, answered: new Set() });
  expect(mockListEvents.mock.calls[0][0]).toEqual(['work']);
  expect(await loadCounted('me')).toEqual(['work']);
});

const show = (seed: (c: QueryClient) => void = () => {}) => {
  const c = client();
  c.setQueryData([...myGroupsKey, 'me'], [group('g1', 'Friday Crew'), group('g2', 'Climbing crew')]);
  seed(c);
  return render(wrap(<CalendarSettingsScreen userId="me" />, c));
};

test('not allowed yet: explains, asks nothing until Allow is tapped, then shows the allowed state', async () => {
  mockAccess = 'undetermined';
  await show();
  expect(await screen.findByText('Pre-fill Free or Busy')).toBeTruthy();
  expect(screen.getByText('Never read, stored or sent: event titles, people, places or notes.')).toBeTruthy();
  expect(screen.getByText('Calendar access: Off')).toBeTruthy();
  expect(mockAccess).toBe('undetermined');
  await press('Allow calendar access');
  expect(await screen.findByText('Calendar access: On')).toBeTruthy();
  await flush();
});

test('allowed: calendars that count and groups that see Free or Busy, each switch with its state in words', async () => {
  mockShares = [{ group_id: 'g1' }];
  await show();
  expect(await screen.findByText('Calendar access: On')).toBeTruthy();
  expect(await screen.findByLabelText('Home counts')).toBeTruthy();
  expect(screen.getByLabelText('Share with Friday Crew').props.value).toBe(true);
  expect(screen.getByLabelText('Share with Climbing crew').props.value).toBe(false);
  expect(screen.getByText('Sees Free or Busy')).toBeTruthy();
  expect(screen.getByText('Not shared')).toBeTruthy();
});

test('a group switch calls set_calendar_share; turning a calendar off is kept on the phone, never uploaded', async () => {
  await show();
  await screen.findByLabelText('Share with Climbing crew');
  await act(async () => fireEvent(screen.getByLabelText('Share with Climbing crew'), 'valueChange', true));
  expect(shareCalls()).toEqual([['set_calendar_share', { group_id: 'g2', enabled: true }]]);
  await act(async () => fireEvent(screen.getByLabelText('Birthdays counts'), 'valueChange', false));
  await flush();
  expect(await loadCounted('me')).toEqual(['home', 'work']);
  expect(mockRpc.mock.calls.every(([fn]) => fn === 'set_calendar_share')).toBe(true);
});

test('a failed switch says which group, keeps the old position and offers Try again', async () => {
  await show();
  await screen.findByLabelText('Share with Friday Crew');
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
  await act(async () => fireEvent(screen.getByLabelText('Share with Friday Crew'), 'valueChange', true));
  expect(screen.getByText('Couldn’t update Friday Crew. Try again.')).toBeTruthy();
  expect(screen.getByLabelText('Share with Friday Crew').props.value).toBe(false);
  await press('Try again');
  expect(shareCalls()).toHaveLength(2);
});

test('Turn off calendar switches every shared group off', async () => {
  mockShares = [{ group_id: 'g1' }, { group_id: 'g2' }];
  await show();
  await screen.findByText('Calendar access: On');
  await press('Turn off calendar');
  expect(shareCalls().map(([, a]) => [a.group_id, a.enabled])).toEqual([['g1', false], ['g2', false]]);
});

test('denied or revoked: says so, offers iPhone Settings, and clears calendar answers once', async () => {
  mockAccess = 'denied'; mockShares = [{ group_id: 'g1' }];
  await show();
  expect(await screen.findByText('Calendar access: Off in iPhone Settings')).toBeTruthy();
  expect(screen.getByText(/Calendar is off for Sidequest/)).toBeTruthy();
  expect(screen.getByText('You can still tap Free or Busy by hand on any pick. Nothing else changes.')).toBeTruthy();
  await flush();
  expect(shareCalls()).toEqual([['set_calendar_share', { group_id: 'g1', enabled: false }]]);
  await press('Open iPhone Settings');
  expect(mockOpenSettings).toHaveBeenCalled();
});

test('no calendars on the phone, and no groups, each say so', async () => {
  mockCalendars = [];
  const c = client();
  c.setQueryData([...myGroupsKey, 'me'], []);
  await render(wrap(<CalendarSettingsScreen userId="me" />, c));
  expect(await screen.findByText('No calendars on this phone')).toBeTruthy();
  expect(await screen.findByText('You’re not in a group yet')).toBeTruthy();
  await press('Join with code');
  expect(mockPush).toHaveBeenCalledWith('/join');
});
