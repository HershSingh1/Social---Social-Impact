import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import ReviewQueueScreen from '../ReviewQueueScreen';
import { ReportListingSheet } from '../ReportListingSheet';
import SuggestionScreen from '../SuggestionScreen';
import { EMPTY_SUGGESTION, draftFrom, reviewerCapabilityKey, submitSuggestion, validateSuggestion } from '../suggestions';

type Result = { data: unknown; error: { message: string; details?: string } | null };
const mockRpc = jest.fn<(fn: string, args?: unknown) => Promise<Result>>();
let mockRows: unknown[] = [];
function mockBuilder() {
  const value: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) value[method] = () => value;
  value.then = (resolve: (result: Result) => unknown) => Promise.resolve({ data: mockRows, error: null }).then(resolve);
  return value;
}
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: (fn: string, args?: unknown) => mockRpc(fn, args), from: () => mockBuilder() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'client-key' }));
jest.mock('../../auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { push: (path: string) => mockPush(path), back: jest.fn() }, useLocalSearchParams: () => mockParams }));

const testClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (node: ReactNode, client = testClient()) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
const tap = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

beforeEach(() => {
  jest.clearAllMocks(); mockRows = []; mockParams = {};
  mockRpc.mockImplementation(async fn => ({ data: fn === 'can_review_listings' ? false : 'submission-id', error: null }));
});

test('the form reports every missing field without clearing what was typed', async () => {
  await render(wrap(<SuggestionScreen />));
  await screen.findByText('Suggest an activity');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Name'), 'Laguna sketch walk'));
  await tap('Send for review');
  expect(screen.getByLabelText('Name').props.value).toBe('Laguna sketch walk');
  expect(screen.getByText('Write at least 20 characters.')).toBeTruthy();
  expect(screen.getByText('Choose a category.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalledWith('submit_listing', expect.anything());
});

test('server field errors are mapped back under the form fields', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_listing', details: '{"name":"required","description":"too_short"}' } });
  const valid = { ...EMPTY_SUGGESTION, name: 'Laguna Gloria', description: 'A lakeside sculpture walk in Austin.', category: 'Art and walks',
    location: '3809 W 35th St', hours: 'Tue–Sun 10–5', duration: '90', source: 'https://example.com' };
  await expect(submitSuggestion(valid, 'same-key')).rejects.toMatchObject({
    fields: { name: 'This field is required.', description: 'Write at least 20 characters.' },
  });
});

test('Needs changes can be reconstructed without losing any submitted values', () => {
  const draft = draftFrom({ id: 's1', authorId: 'me', kind: 'listing', state: 'needs_changes', reason: 'Add hours', createdAt: '', updatedAt: '', payload: {
    name: 'Pottery', description: 'A welcoming pottery studio for beginners.', category: 'Make something', address: '12 Clay St',
    timing_kind: 'fixed', sessions: [{ start_local: '2026-11-22 10:00', end_local: '2026-11-22 12:00' }], duration_min: 120,
    price_kind: 'estimated', price_min: 20, price_max: 30, source: 'https://example.com/pottery', image_url: 'https://example.com/a.jpg',
  } });
  expect(validateSuggestion(draft)).toEqual({});
  expect(draft).toMatchObject({ name: 'Pottery', sessions: '2026-11-22 10:00 | 2026-11-22 12:00', priceMin: '20', priceMax: '30' });
});

test('price validation ignores hidden values and rejects non-finite prices', () => {
  const draft = { ...EMPTY_SUGGESTION, priceMin: '20', priceMax: '10' };
  expect(validateSuggestion({ ...draft, priceKind: 'free' }).priceMax).toBeUndefined();
  expect(validateSuggestion({ ...draft, priceKind: 'exact' }).priceMax).toBe('The maximum must be at least the minimum.');
  expect(validateSuggestion({ ...draft, priceKind: 'estimated', priceMin: 'Infinity', priceMax: 'oops' })).toMatchObject({
    priceMin: 'Enter a price of 0 or more.', priceMax: 'Enter a price of 0 or more.',
  });
});

test('a report keeps its text through failure and shows the exact thank-you after retry', async () => {
  mockRpc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: null, error: null });
  await render(<ReportListingSheet experienceId="e1" visible onClose={() => {}} />);
  await act(async () => fireEvent.changeText(screen.getByLabelText('What needs updating?'), 'Now closed on Sundays'));
  await tap('Send report');
  expect(screen.getByLabelText('What needs updating?').props.value).toBe('Now closed on Sundays');
  expect(screen.getByText(/Your note is still here/)).toBeTruthy();
  await tap('Send report');
  expect(await screen.findByText('Thanks, a reviewer will check it.')).toBeTruthy();
});

test('the review route reveals no queue to a normal member', async () => {
  const client = testClient();
  client.setQueryData(reviewerCapabilityKey('previous-reviewer'), true);
  client.setQueryData(['listing-review-queue', 'previous-reviewer'], { submissions: [], reports: [] });
  await render(wrap(<ReviewQueueScreen />, client));
  expect(screen.queryByText('Outdated-info reports')).toBeNull();
  expect(await screen.findByText('Review queue isn’t available')).toBeTruthy();
  expect(screen.queryByText('Outdated-info reports')).toBeNull();
});
