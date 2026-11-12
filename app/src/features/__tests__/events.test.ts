import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { castVote, closePick, createPick } from '../picks/api';
import { EMPTY_DRAFT } from '../picks/model';
import { respond } from '../plans/plan';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args) } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const logged = () => mockRpc.mock.calls.filter(([fn]) => fn === 'log_event').map(([, args]) => args);

beforeEach(() => { mockRpc.mockReset(); });

describe('screens and calls log the Phase 1 events', () => {
  test('a vote logs vote_cast with the value; clearing a vote logs nothing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await castVote('o1', 'maybe');
    await castVote('o1', null);
    expect(logged()).toEqual([{ name: 'vote_cast', props: { option_id: 'o1', value: 'maybe' } }]);
  });

  test('a new pick logs pick_created with the pick and group ids', async () => {
    mockRpc.mockResolvedValue({ data: 'pick-1', error: null });
    await createPick({ ...EMPTY_DRAFT, groupId: 'g1', options: [{ experienceId: 'e1', name: 'Clay', detail: '' }] }, 'key', new Date('2026-12-01T00:00:00Z'));
    expect(logged()).toEqual([{ name: 'pick_created', props: { pick_id: 'pick-1', group_id: 'g1' } }]);
  });

  test('closing a pick logs pick_closed; cancelling one does not', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await closePick('k1');
    expect(logged()).toEqual([{ name: 'pick_closed', props: { pick_id: 'k1' } }]);
  });

  test('an answer logs rsvp_saved with the status', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await respond('p1', 2, 'going');
    expect(logged()).toEqual([{ name: 'rsvp_saved', props: { plan_id: 'p1', status: 'going' } }]);
  });

  test('a refused call logs nothing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'plan_cancelled' } });
    await expect(respond('p1', 2, 'going')).rejects.toThrow();
    await expect(closePick('k1')).rejects.toThrow();
    expect(logged()).toEqual([]);
  });

  test('a failing log never breaks the call it rides on', async () => {
    mockRpc.mockImplementation(async fn => {
      if (fn === 'log_event') throw new Error('offline');
      return { data: null, error: null };
    });
    await expect(respond('p1', 2, 'cant_go')).resolves.toBeUndefined();
  });
});
