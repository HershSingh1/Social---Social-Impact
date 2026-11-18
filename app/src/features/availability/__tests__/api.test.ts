import { expect, jest, test } from '@jest/globals';
import { fetchAvailability, setAvailability } from '../api';

const mockTallies = jest.fn(async (_column: string, _ids: string[]) => ({
  data: [{ option_id: 'first', free: 0, busy: 1 }, { option_id: 'second', free: 2, busy: 0 }], error: null,
}));
const mockAnswers = jest.fn(async (_column: string, _ids: string[]) => ({
  data: [{ option_id: 'first', status: 'busy' }], error: null,
}));
const mockOwnerFilter = jest.fn((_column: string, _viewer: string) => ({ in: mockAnswers }));
const mockRpc = jest.fn(async (_name: string, _args: object) => ({ error: null }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({ select: () => table === 'availability' ? { eq: mockOwnerFilter } : { in: mockTallies } }),
    rpc: (name: string, args: object) => mockRpc(name, args),
  },
}));

test('returns counts for each option and only asks for the viewer’s answer', async () => {
  const ids = ['first', 'second'];
  await expect(fetchAvailability(ids, 'viewer')).resolves.toEqual({
    first: { free: 0, busy: 1, myAnswer: 'busy' },
    second: { free: 2, busy: 0, myAnswer: null },
  });
  expect(mockOwnerFilter).toHaveBeenCalledWith('user_id', 'viewer');
  expect(mockTallies).toHaveBeenCalledWith('option_id', ids);
  expect(mockAnswers).toHaveBeenCalledWith('option_id', ids);
});

test('writes and clears a manual answer through the availability RPC', async () => {
  await setAvailability('first', 'free');
  await setAvailability('first', null);
  expect(mockRpc).toHaveBeenNthCalledWith(1, 'set_availability', { option_id: 'first', status: 'free' });
  expect(mockRpc).toHaveBeenNthCalledWith(2, 'set_availability', { option_id: 'first', status: null });
});
