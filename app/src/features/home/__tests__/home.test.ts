import { expect, test } from '@jest/globals';
import type { GroupSummary } from '../../groups/overview';
import type { HubPick, HubPlan } from '../../plans/hub';
import { greeting, groupState, needsInput, pickUpNext, todayLine } from '../home';

const now = new Date('2026-11-13T18:00:00Z'); // Fri 12:00 PM in Austin
const plan = (overrides: Partial<HubPlan>): HubPlan => ({
  id: 'plan', experienceName: 'Comedy Night at Cap City', groupName: 'Friday Crew', state: 'sent',
  startAt: '2026-11-15T02:00:00Z', endAt: '2026-11-15T04:00:00Z', viewerStatus: 'going', ...overrides,
});
const pick = (overrides: Partial<HubPick>): HubPick => ({
  id: 'pick', title: 'Saturday plans', groupName: 'Roommates', state: 'open', deadline: '2026-11-13T23:00:00Z',
  viewerComplete: false, ...overrides,
});

test('the date line and greeting come from Austin time and the profile name', () => {
  expect(todayLine(now)).toBe('Friday, Nov 13');
  expect(greeting('  Hersh ')).toBe('Hi, Hersh');
  expect(greeting(null)).toBe('Hi there');
});

test('Up next is the soonest sent plan the viewer is going to, with the zone named', () => {
  const next = pickUpNext([
    plan({ id: 'later', startAt: '2026-11-20T02:00:00Z', endAt: '2026-11-20T04:00:00Z' }),
    plan({ id: 'unanswered', viewerStatus: 'awaiting', startAt: '2026-11-14T02:00:00Z', endAt: '2026-11-14T04:00:00Z' }),
    plan({ id: 'cancelled', state: 'cancelled', startAt: '2026-11-14T03:00:00Z', endAt: '2026-11-14T04:00:00Z' }),
    plan({ id: 'over', startAt: '2026-11-12T02:00:00Z', endAt: '2026-11-12T04:00:00Z' }),
    plan({ id: 'soonest' }),
  ], now);
  expect(next).toEqual({
    id: 'soonest', title: 'Comedy Night at Cap City', when: 'Sat, Nov 14 · 8:00 PM CST', groupName: 'Friday Crew',
  });
  expect(pickUpNext([], now)).toBeNull();
});

test('Needs your input lists unfinished votes first, then plans waiting on an RSVP, and skips finished votes', () => {
  const items = needsInput({
    plans: [plan({ id: 'rsvp', viewerStatus: 'awaiting' }), plan({ id: 'going' })],
    picks: [pick({ id: 'voted', viewerComplete: true }), pick({ id: 'open' })],
  }, now);
  expect(items.map(item => [item.kind, item.action, item.href])).toEqual([
    ['vote', 'Vote', '/pick/open'], ['answer', 'Answer', '/plan/rsvp'],
  ]);
  expect(items[0]).toMatchObject({ title: 'Vote on Saturday plans', detail: 'Roommates · closes in 5 h' });
});

test('a group says its state in words: open vote, confirmed plan, or nothing yet', () => {
  const group: GroupSummary = { id: 'g', name: 'Friday Crew', memberCount: 3, faces: [], next: '' };
  expect(groupState({ ...group, openPick: { id: 'k', title: 'x', deadline: '2026-11-13T23:00:00Z' } }, now.getTime()))
    .toBe('Vote open · closes in 5 h');
  expect(groupState({ ...group, nextPlan: { id: 'p', name: 'x', startAt: '2026-11-15T02:00:00Z' } }, now.getTime()))
    .toBe('Plan confirmed · Sat 8 PM');
  expect(groupState({ ...group, nextPlan: { id: 'p', name: 'x', startAt: '2026-11-15T02:30:00Z' } }, now.getTime()))
    .toBe('Plan confirmed · Sat 8:30 PM');
  expect(groupState(group, now.getTime())).toBe('Nothing planned yet');
});
