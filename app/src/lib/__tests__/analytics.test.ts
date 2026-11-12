import { beforeEach, expect, jest, test } from '@jest/globals';

import { logEvent } from '../analytics';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args) } }));

beforeEach(() => { mockRpc.mockReset(); });

test('sends the name and props to log_event', () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  logEvent('vote_cast', { option_id: 'o1', value: 'maybe' });
  expect(mockRpc).toHaveBeenCalledWith('log_event', { name: 'vote_cast', props: { option_id: 'o1', value: 'maybe' } });
});

test('leaves out props that are undefined', () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  logEvent('plan_sent', { plan_id: 'p1', group_id: undefined });
  expect(mockRpc).toHaveBeenCalledWith('log_event', { name: 'plan_sent', props: { plan_id: 'p1' } });
});

test('returns at once and does not throw when the call is rejected', async () => {
  mockRpc.mockRejectedValue(new Error('offline'));
  expect(() => logEvent('experience_viewed', { experience_id: 'e1' })).not.toThrow();
  await Promise.resolve();
});

test('does not throw when the client throws', () => {
  mockRpc.mockImplementation(() => { throw new Error('boom'); });
  expect(() => logEvent('plan_cancelled')).not.toThrow();
});
