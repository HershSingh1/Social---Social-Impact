import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BUDGET_ERROR, budgetText, parseBudget, SAVE_FAILED } from '../defaults';
import { ProfileDefaultsScreen } from '../ProfileDefaultsScreen';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args?: Record<string, unknown>) => Promise<Result>>();
let mockRow: Record<string, unknown> | null;
let mockReadError: boolean;
let mockHold: Promise<void> | null;
jest.mock('../../../lib/supabase', () => ({ supabase: {
  rpc: (fn: string, args?: Record<string, unknown>) => mockRpc(fn, args),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
    if (mockHold) await mockHold;
    return mockReadError ? { data: null, error: { message: 'down' } } : { data: mockRow, error: null };
  } }) }) }),
} }));

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileDefaultsScreen userId="me" /></QueryClientProvider>);
const tap = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const save = () => screen.getByRole('button', { name: /^Save/ });

beforeEach(() => {
  jest.clearAllMocks(); mockRow = { budget_cap: null, transport: null, budget_opt_in: false }; mockReadError = false; mockHold = null;
  mockRpc.mockResolvedValue({ data: null, error: null });
});

test('the budget field takes dollars and cents, tolerates $ and commas, and refuses anything else', () => {
  expect(parseBudget('')).toEqual({ value: null });
  expect(parseBudget('  35 ')).toEqual({ value: 35 });
  expect(parseBudget('$12.50')).toEqual({ value: 12.5 });
  expect(parseBudget('1,000')).toEqual({ value: 1000 });
  expect(parseBudget('0')).toEqual({ value: 0 });
  for (const bad of ['1000.01', '1500', '-5', '12.345', 'ten', '1e3', '12,5,0x']) expect(parseBudget(bad).error).toBe(BUDGET_ERROR);
  expect(budgetText(35)).toBe('35');
  expect(budgetText(12.5)).toBe('12.50');
  expect(budgetText(null)).toBe('');
});

test('loading: the privacy line is there, the words say what is loading, and Save is off', async () => {
  let release!: () => void;
  mockHold = new Promise<void>(r => { release = r; });
  await show();
  expect(screen.getByText('Only you can see this. It is never shown to your groups or copied into a plan.')).toBeTruthy();
  expect(screen.getByText('Loading your saved values…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
  await act(async () => release());
  expect(await screen.findByText('How you usually get around')).toBeTruthy();
});

test('a failed read says so and can be tried again', async () => {
  mockReadError = true;
  await show();
  expect(await screen.findByText('Couldn’t load your saved values.')).toBeTruthy();
  mockReadError = false;
  await tap('Try again');
  expect(await screen.findByText('How you usually get around')).toBeTruthy();
});

test('nothing set: an empty field, No preference chosen, the switch off with its reason, and Save off', async () => {
  await show();
  expect(await screen.findByLabelText('Usual budget, per person (optional)')).toBeTruthy();
  expect(screen.getByLabelText('Usual budget, per person (optional)').props.value).toBe('');
  expect(screen.getByText('Dollars for one outing. 0 to 1,000, cents allowed.')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'No preference' }).props.accessibilityState.checked).toBe(true);
  // The switch reads its own setting, so it can still be loading when the form first appears.
  expect(await screen.findByText('Set a budget to turn this on.')).toBeTruthy();
  expect(screen.getByLabelText('Use my budget in group filters').props.disabled).toBe(true);
  expect(save().props.accessibilityState.disabled).toBe(true);
  expect(screen.queryByText('Clear budget')).toBeNull();
});

test('saved values come back into the form, and the switch explains itself once a budget exists', async () => {
  mockRow = { budget_cap: '12.50', transport: 'transit', budget_opt_in: true };
  await show();
  expect((await screen.findByLabelText('Usual budget, per person (optional)')).props.value).toBe('12.50');
  expect(screen.getByRole('checkbox', { name: 'Transit' }).props.accessibilityState.checked).toBe(true);
  expect(await screen.findByText(/Nobody sees your amount. The filter hides activities above the lowest budget/)).toBeTruthy();
  expect(screen.getByLabelText('Use my budget in group filters').props.value).toBe(true);
  expect(screen.getByText('Clear budget')).toBeTruthy();
});

test('saving sends both values, then says Saved just now and dims the button', async () => {
  await show();
  await act(async () => fireEvent.changeText(await screen.findByLabelText('Usual budget, per person (optional)'), '$40'));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Walk' })));
  expect(save().props.accessibilityState.disabled).toBe(false);
  await tap('Save');
  expect(mockRpc).toHaveBeenCalledWith('set_profile_defaults', { budget_cap: 40, transport: 'walk' });
  expect(await screen.findByText('Saved just now')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Saved' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText('Usual budget, per person (optional)').props.value).toBe('40');
  // The switch now has a saved budget to count.
  expect((await screen.findByLabelText('Use my budget in group filters')).props.disabled).toBe(false);
});

test('tapping the chosen chip again, or No preference, clears how you get around', async () => {
  mockRow = { budget_cap: 20, transport: 'bike', budget_opt_in: false };
  await show();
  await act(async () => fireEvent.press(await screen.findByRole('checkbox', { name: 'Bike' })));
  expect(screen.getByRole('checkbox', { name: 'No preference' }).props.accessibilityState.checked).toBe(true);
  await tap('Save');
  expect(mockRpc).toHaveBeenLastCalledWith('set_profile_defaults', { budget_cap: 20, transport: null });
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Drive' })));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'No preference' })));
  expect(screen.getByRole('checkbox', { name: 'Drive' }).props.accessibilityState.checked).toBe(false);
});

test('Clear budget empties the field, and saving it sends null', async () => {
  mockRow = { budget_cap: 50, transport: 'drive', budget_opt_in: false };
  await show();
  await screen.findByLabelText('Usual budget, per person (optional)');
  await tap('Clear budget');
  expect(screen.getByLabelText('Usual budget, per person (optional)').props.value).toBe('');
  await tap('Save');
  expect(mockRpc).toHaveBeenLastCalledWith('set_profile_defaults', { budget_cap: null, transport: 'drive' });
});

test('a field error sits under the field, nothing typed is lost, and nothing is sent', async () => {
  await show();
  await act(async () => fireEvent.changeText(await screen.findByLabelText('Usual budget, per person (optional)'), '1500'));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Bike' })));
  await tap('Save');
  expect(screen.getByText(BUDGET_ERROR)).toBeTruthy();
  expect(screen.getByLabelText('Usual budget, per person (optional)').props.value).toBe('1500');
  expect(screen.getByRole('checkbox', { name: 'Bike' }).props.accessibilityState.checked).toBe(true);
  expect(mockRpc).not.toHaveBeenCalledWith('set_profile_defaults', expect.anything());
  await act(async () => fireEvent.changeText(screen.getByLabelText('Usual budget, per person (optional)'), '150'));
  expect(screen.queryByText(BUDGET_ERROR)).toBeNull();
});

test('a failed save keeps what was typed, says so in words, and Try again sends it', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
  await show();
  await act(async () => fireEvent.changeText(await screen.findByLabelText('Usual budget, per person (optional)'), '60'));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Drive' })));
  await tap('Save');
  expect(screen.getByText(SAVE_FAILED)).toBeTruthy();
  expect(screen.getByLabelText('Usual budget, per person (optional)').props.value).toBe('60');
  expect(screen.getByRole('checkbox', { name: 'Drive' }).props.accessibilityState.checked).toBe(true);
  expect(screen.queryByText('Saved just now')).toBeNull();
  await tap('Try again');
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
  expect(mockRpc).toHaveBeenLastCalledWith('set_profile_defaults', { budget_cap: 60, transport: 'drive' });
  expect(await screen.findByText('Saved just now')).toBeTruthy();
  expect(screen.queryByText(SAVE_FAILED)).toBeNull();
});

test('while saving the button shows progress and a second tap does not send twice', async () => {
  let release!: (r: Result) => void;
  mockRpc.mockImplementationOnce(() => new Promise<Result>(r => { release = r; }));
  await show();
  await act(async () => fireEvent.changeText(await screen.findByLabelText('Usual budget, per person (optional)'), '25'));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })); });
  expect(await screen.findByText('Save…')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })); });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  await act(async () => release({ data: null, error: null }));
  expect(await screen.findByText('Saved just now')).toBeTruthy();
});
