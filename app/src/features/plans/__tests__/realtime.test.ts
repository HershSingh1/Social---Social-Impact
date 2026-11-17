import { expect, jest, test } from '@jest/globals';
import { plansHubRealtimeTargets } from '../usePlansHub';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../drafts', () => ({ loadSavedDrafts: jest.fn() }));

test('filters hub changes to the viewer and the rows already shown', () => {
  const targets = plansHubRealtimeTargets('viewer', ['plan-b', 'plan-a'], ['pick-a']);
  expect(targets).toEqual([
    { table: 'rsvps', filter: 'user_id=eq.viewer' },
    { table: 'pick_voter_status', filter: 'user_id=eq.viewer' },
    { table: 'plans', filter: 'organizer_id=eq.viewer' },
    { table: 'picks', filter: 'organizer_id=eq.viewer' },
    { table: 'plans', filter: 'id=eq.plan-b' },
    { table: 'plan_revisions', filter: 'plan_id=eq.plan-b' },
    { table: 'plans', filter: 'id=eq.plan-a' },
    { table: 'plan_revisions', filter: 'plan_id=eq.plan-a' },
    { table: 'picks', filter: 'id=eq.pick-a' },
  ]);
  expect(targets.every(target => target.filter.includes('=eq.'))).toBe(true);
});

test('deduplicates ids when query relations repeat a row', () => {
  const targets = plansHubRealtimeTargets('viewer', ['plan-a', 'plan-a'], ['pick-a', 'pick-a']);
  expect(targets.filter(target => target.filter.endsWith('plan-a'))).toHaveLength(2);
  expect(targets.filter(target => target.filter.endsWith('pick-a'))).toHaveLength(1);
});
