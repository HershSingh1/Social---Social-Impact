import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PickDetail } from '../api';
import { finalOrder, planThisPath } from '../model';
import { PickOrganizerActions } from '../PickOrganizerActions';
import { PickResultScreen } from '../PickResultScreen';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args) } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// The worked example from P0-09: Sketch 3 Yes 2 Maybe 1 No = 8, Clay 4 Yes 2 No = 8, Barton 2 Yes 1 Maybe = 5.
const option = (id: string, name: string, position: number, yes: number, maybe: number, no: number) =>
  ({ id, name, position, experienceId: `e-${id}`, tally: { yes, maybe, no } });
const sketch = option('s', 'Sketch and stroll', 2, 3, 2, 1);
const clay = option('c', 'Clay and conversation', 1, 4, 0, 2);
const barton = option('b', 'Barton Springs swim', 3, 2, 1, 0);

const pick = (change: Partial<PickDetail> = {}): PickDetail => ({
  id: 'k1', title: 'Saturday?', groupId: 'g1', groupName: 'Saturday crew', organizerId: 'maya', deadline: '2026-11-13T00:00:00Z',
  state: 'closed', winnerOptionId: 's', tieRule: 'Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).',
  options: [clay, sketch, barton],
  voters: [{ id: 'maya', name: 'Maya', complete: true }, { id: 'jordan', name: 'Jordan', complete: true }], ...change,
});

const handlers = () => ({ onPlanThis: jest.fn(), onOpenPlan: jest.fn(), onChanged: jest.fn() });
const show = async (p: PickDetail, viewer: string, h = handlers()) => { await render(<PickResultScreen pick={p} viewerId={viewer} {...h} />); return h; };
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

beforeEach(() => { mockRpc.mockReset(); });

describe('final order', () => {
  test('the worked example: Sketch beats Clay on fewer No votes, Barton is third', () => {
    expect(finalOrder([barton, clay, sketch], undefined, 's').map(o => o.id)).toEqual(['s', 'c', 'b']);
    expect(finalOrder([barton, clay, sketch]).map(o => o.id)).toEqual(['s', 'c', 'b']);
  });
  test('a full tie goes to the starred option, then the option added first', () => {
    const a = option('a', 'A', 1, 1, 0, 0); const b = option('b2', 'B', 2, 1, 0, 0);
    expect(finalOrder([a, b], 'b2').map(o => o.id)).toEqual(['b2', 'a']);
    expect(finalOrder([b, a]).map(o => o.id)).toEqual(['a', 'b2']);
  });
  test('Plan this opens the draft with the group, experience, pick and proposed time', () => {
    expect(planThisPath({ id: 'k1', groupId: 'g1' }, { experienceId: 'e1', proposedStart: '2026-11-14T16:00:00Z' }))
      .toBe('/plan/new?group=g1&experience=e1&pick=k1&start=2026-11-14T16%3A00%3A00Z');
  });
});

describe('result screen', () => {
  test('shows the winner, the options in final order with counts, and the server rule sentence', async () => {
    await show(pick(), 'jordan');
    expect(screen.getByText('Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).')).toBeTruthy();
    expect(screen.getByLabelText('1. Sketch and stroll, winner, 8 points, 3 yes, 2 maybe, 1 no')).toBeTruthy();
    expect(screen.getByLabelText('2. Clay and conversation, 8 points, 4 yes, 0 maybe, 2 no')).toBeTruthy();
    expect(screen.getByLabelText('3. Barton Springs swim, 5 points, 2 yes, 1 maybe, 0 no')).toBeTruthy();
    expect(screen.getByText('Winner')).toBeTruthy();
  });

  test('the organizer sees Plan this for the winner; members see who will send a plan', async () => {
    const h = await show(pick(), 'maya');
    await tap('Plan Sketch and stroll');
    expect(h.onPlanThis).toHaveBeenCalledWith('s');
    await screen.unmount();
    await show(pick(), 'jordan');
    expect(screen.getByText('Maya will send a plan.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Plan / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel pick' })).toBeNull();
  });

  test('nobody voted: the organizer chooses which option to plan', async () => {
    const h = await show(pick({ winnerOptionId: undefined, tieRule: 'Nobody voted. The organizer chooses an option.' }), 'maya');
    expect(screen.getByText('Nobody voted')).toBeTruthy();
    await tap('Plan Barton Springs swim');
    expect(h.onPlanThis).toHaveBeenCalledWith('b');
    await screen.unmount();
    await show(pick({ winnerOptionId: undefined }), 'jordan');
    expect(screen.getByText('Maya will choose an option and send a plan.')).toBeTruthy();
  });

  test('a planned pick links to its plan', async () => {
    const h = await show(pick({ state: 'planned', planId: 'p1' }), 'jordan');
    await tap('Open the plan');
    expect(h.onOpenPlan).toHaveBeenCalledWith('p1');
  });

  test('a cancelled pick says who cancelled it', async () => {
    await show(pick({ state: 'cancelled', winnerOptionId: undefined }), 'jordan');
    expect(screen.getByText('Maya cancelled this pick.')).toBeTruthy();
  });
});

describe('Cancel pick', () => {
  test('asks first, and only calls cancel_pick when confirmed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const h = await show(pick(), 'maya');
    await tap('Cancel pick');
    expect(screen.getByText('Cancel this pick?')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Cancel pick' }).at(-1)!));
    expect(mockRpc).toHaveBeenCalledWith('cancel_pick', { pick_id: 'k1' });
    expect(h.onChanged).toHaveBeenCalled();
  });

  test('a refusal is shown in words and nothing changes', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'pick_not_cancellable' } });
    const h = await show(pick(), 'maya');
    await tap('Cancel pick');
    await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Cancel pick' }).at(-1)!));
    expect(screen.getByText('This pick already has a plan, so it can’t be cancelled.')).toBeTruthy();
    expect(h.onChanged).not.toHaveBeenCalled();
  });
});

describe('Close now', () => {
  test('asks first, then closes once on the server and refreshes', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const onDone = jest.fn();
    await render(<PickOrganizerActions pickId="k1" allowClose onDone={onDone} />);
    await tap('Close now');
    expect(screen.getByText('Close voting now?')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    await tap('Close voting');
    // One close on the server, and one analytics event for it.
    expect(mockRpc.mock.calls.filter(([fn]) => fn === 'close_pick')).toHaveLength(1);
    expect(mockRpc).toHaveBeenCalledWith('close_pick', { pick_id: 'k1' });
    expect(mockRpc).toHaveBeenCalledWith('log_event', { name: 'pick_closed', props: { pick_id: 'k1' } });
    expect(onDone).toHaveBeenCalled();
  });

  test('after the deadline only Cancel pick is offered, and a dropped connection keeps the sheet open', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    const onDone = jest.fn();
    await render(<PickOrganizerActions pickId="k1" allowClose={false} onDone={onDone} />);
    expect(screen.queryByRole('button', { name: 'Close now' })).toBeNull();
    await tap('Cancel pick');
    await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Cancel pick' }).at(-1)!));
    expect(screen.getByText('Couldn’t reach the server. Check your connection and try again.')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
