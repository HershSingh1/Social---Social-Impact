import { expect, test } from '@jest/globals';
import { buildPlansHub, type HubPlan } from '../hub';

const plan = (overrides: Partial<HubPlan>): HubPlan => ({
  id: 'plan', experienceName: 'Comedy Night', groupName: 'Friday Crew', state: 'sent',
  startAt: '2026-11-14T02:00:00Z', endAt: '2026-11-14T04:00:00Z', viewerStatus: 'going',
  ...overrides,
});

const now = new Date('2026-11-11T18:00:00Z');

test('puts each future plan in exactly one section and orders responses before upcoming', () => {
  const data = {
    plans: [
      plan({ id: 'going', startAt: '2026-11-12T20:00:00Z' }),
      plan({ id: 'awaiting-later', viewerStatus: 'awaiting', startAt: '2026-11-14T20:00:00Z' }),
      plan({ id: 'reconfirm', viewerStatus: 'needs_reconfirm', startAt: '2026-11-15T20:00:00Z' }),
      plan({ id: 'awaiting-sooner', viewerStatus: 'awaiting', startAt: '2026-11-13T20:00:00Z' }),
      plan({ id: 'cancelled', state: 'cancelled', viewerStatus: 'awaiting', startAt: '2026-11-12T22:00:00Z' }),
    ],
    picks: [],
  };
  const hub = buildPlansHub(data, now);
  expect(hub.needsResponse.map(item => item.id)).toEqual(['reconfirm', 'awaiting-sooner', 'awaiting-later']);
  expect(hub.upcoming.map(item => item.id)).toEqual(['going', 'cancelled']);
  expect([...hub.needsResponse, ...hub.upcoming].map(item => item.id)).toHaveLength(new Set(data.plans.map(item => item.id)).size);
});

test('keeps cancelled plans until their original end and excludes ended plans', () => {
  const hub = buildPlansHub({ plans: [
    plan({ id: 'visible', state: 'cancelled', endAt: '2026-11-11T19:00:00Z' }),
    plan({ id: 'ended', state: 'cancelled', endAt: '2026-11-11T17:00:00Z' }),
  ], picks: [] }, now);
  expect(hub.upcoming.map(item => item.id)).toEqual(['visible']);
  expect(hub.upcoming[0].statusLabel).toBe('Cancelled');
});

test('orders vote-needed picks first and counts only actionable items in the badge', () => {
  const hub = buildPlansHub({
    plans: [plan({ id: 'awaiting', viewerStatus: 'awaiting' }), plan({ id: 'going' })],
    picks: [
      { id: 'done', title: 'Done', groupName: 'A', state: 'open', deadline: '2026-11-12T18:00:00Z', viewerComplete: true },
      { id: 'later', title: 'Later', groupName: 'B', state: 'open', deadline: '2026-11-13T18:00:00Z', viewerComplete: false },
      { id: 'sooner', title: 'Sooner', groupName: 'C', state: 'open', deadline: '2026-11-12T18:00:00Z', viewerComplete: false },
    ],
  }, now);
  expect(hub.openPicks.map(item => item.id)).toEqual(['sooner', 'later', 'done']);
  expect(hub.badgeCount).toBe(3);
});

test('is empty when there are no current plans or open picks', () => {
  const hub = buildPlansHub({ plans: [], picks: [] }, now);
  expect(hub.isEmpty).toBe(true);
  expect(hub.badgeCount).toBe(0);
});
