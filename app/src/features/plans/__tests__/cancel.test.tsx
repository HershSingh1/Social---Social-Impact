import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CancelPlanSheet } from '../CancelPlanSheet';
import { cancelledLine, cancelPlan, CancelRefused, reasonText, validateCancel } from '../cancel';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args) } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const cancelCalls = () => mockRpc.mock.calls.filter(([fn]) => fn === 'cancel_plan');
beforeEach(() => { mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: null, error: null }); });

describe('reasons', () => {
  test('a reason is needed, and Other needs words', () => {
    expect(validateCancel(null, '')).toEqual({ reason: 'Pick a reason.' });
    expect(validateCancel('Weather', '')).toEqual({});
    expect(validateCancel('Other', '   ').other).toBeTruthy();
    expect(validateCancel('Other', 'x'.repeat(201)).other).toMatch(/200/);
    expect(validateCancel('Other', 'Maya is sick')).toEqual({});
  });
  test('Other sends its own words; the others send their label', () => {
    expect(reasonText('Venue closed', 'ignored')).toBe('Venue closed');
    expect(reasonText('Other', ' Maya is sick ')).toBe('Maya is sick');
  });
  test('the cancelled line names the organizer, or falls back when they are gone', () => {
    expect(cancelledLine('Maya', 'Weather')).toBe('Maya cancelled this plan: Weather.');
    expect(cancelledLine(undefined, null)).toBe('The organizer cancelled this plan.');
  });
});

describe('cancelPlan', () => {
  test('calls cancel_plan, then logs plan_cancelled', async () => {
    await cancelPlan('p1', 'Weather');
    expect(mockRpc).toHaveBeenCalledWith('cancel_plan', { plan_id: 'p1', reason: 'Weather' });
    expect(mockRpc).toHaveBeenCalledWith('log_event', { name: 'plan_cancelled', props: { plan_id: 'p1' } });
  });
  test('a refusal is put in words and nothing is logged', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'plan_ended' } });
    await expect(cancelPlan('p1', 'Weather')).rejects.toBeInstanceOf(CancelRefused);
    expect(mockRpc.mock.calls.filter(([fn]) => fn === 'log_event')).toHaveLength(0);
  });
  test('a connection error is passed through so Try again can retry', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    await expect(cancelPlan('p1', 'Weather')).rejects.not.toBeInstanceOf(CancelRefused);
  });
});

describe('cancel sheet', () => {
  const show = async (onCancelled = jest.fn()) => {
    await render(<CancelPlanSheet planId="p1" organizerName="Maya" invited={4} visible onClose={() => {}} onCancelled={onCancelled} />);
    return onCancelled;
  };
  const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
  const check = (name: string) => act(async () => fireEvent.press(screen.getByRole('checkbox', { name })));

  test('offers the four reasons; Continue with none picked says so and sends nothing', async () => {
    await show();
    for (const reason of ['Weather', 'Not enough people', 'Venue closed', 'Other']) expect(screen.getByRole('checkbox', { name: reason })).toBeTruthy();
    await press('Continue');
    expect(screen.getByText('Pick a reason.')).toBeTruthy();
    expect(cancelCalls()).toHaveLength(0);
  });

  test('Other without words keeps the sheet open under the field', async () => {
    await show();
    await check('Other');
    await press('Continue');
    expect(screen.getByText('Say why, in a few words.')).toBeTruthy();
    expect(cancelCalls()).toHaveLength(0);
  });

  test('asks first, showing what invitees will read, then cancels once', async () => {
    const onCancelled = await show();
    await check('Weather');
    await press('Continue');
    expect(screen.getByText('Everyone invited will see: Maya cancelled this plan: Weather.')).toBeTruthy();
    expect(screen.getByText(/3 people will be told/)).toBeTruthy();
    expect(cancelCalls()).toHaveLength(0);
    await press('Cancel plan');
    expect(cancelCalls()).toEqual([['cancel_plan', { plan_id: 'p1', reason: 'Weather' }]]);
    expect(onCancelled).toHaveBeenCalled();
  });

  test('Keep plan goes back without cancelling', async () => {
    await show();
    await check('Venue closed');
    await press('Continue');
    await press('Keep plan');
    expect(cancelCalls()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  test('a lost connection keeps the choice and lets the organizer try again', async () => {
    const onCancelled = await show();
    await check('Other');
    await act(async () => fireEvent.changeText(screen.getByLabelText('Reason'), 'Maya is sick'));
    await press('Continue');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    await press('Cancel plan');
    expect(onCancelled).not.toHaveBeenCalled();
    expect(screen.getByText('Couldn’t cancel. Check your connection and try again.')).toBeTruthy();
    await press('Cancel plan');
    expect(cancelCalls()).toHaveLength(2);
    expect(cancelCalls()[1][1]).toEqual({ plan_id: 'p1', reason: 'Maya is sick' });
    expect(onCancelled).toHaveBeenCalled();
  });
});
