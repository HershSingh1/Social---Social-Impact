import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GroupRosterScreen } from '../GroupRosterScreen';

type Result = { data: unknown; error: { message: string } | null };
let mockMembers: Result;
let mockCards: Result;
let mockOnChange: (() => void) | undefined;
let mockOnStatus: ((status: string) => void) | undefined;
const mockRemoveChannel = jest.fn();

function mockQuery(result: () => Result) {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'is', 'order']) chain[name] = () => chain;
  chain.maybeSingle = async () => ({ data: { name: 'Saturday crew' }, error: null });
  chain.then = (resolve: (value: Result) => unknown) => resolve(result());
  return chain;
}
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => table === 'groups' ? mockQuery(() => ({ data: null, error: null })) : mockQuery(() => mockMembers),
    rpc: async () => mockCards,
    channel: () => {
      const channel = {
        on: (_type: string, _filter: unknown, callback: () => void) => { mockOnChange = callback; return channel; },
        subscribe: (callback: (status: string) => void) => { mockOnStatus = callback; return channel; },
      };
      return channel;
    },
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
  },
}));


const maya = { user_id: 'u1', role: 'owner' };
const jordan = { user_id: 'u2', role: 'member' };
const people = { data: [{ user_id: 'u1', display_name: 'Maya Kim', avatar_path: null }, { user_id: 'u2', display_name: 'Jordan Reyes', avatar_path: null }], error: null };

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><GroupRosterScreen groupId="g1" /></QueryClientProvider>);
}

beforeEach(() => { mockOnChange = undefined; mockOnStatus = undefined; mockRemoveChannel.mockClear(); mockCards = people; });

test('shows loading, then the members with the Owner badge in words', async () => {
  mockMembers = { data: [maya, jordan], error: null };
  await renderScreen();
  expect(screen.getByLabelText('Loading members…')).toBeTruthy();
  expect(await screen.findByText('Maya Kim')).toBeTruthy();
  expect(screen.getByText('Jordan Reyes')).toBeTruthy();
  expect(screen.getByText('Saturday crew')).toBeTruthy();
  expect(screen.getByText('2 members')).toBeTruthy();
  expect(screen.getAllByText('Owner')).toHaveLength(1);
});

test('shows the removed state when the roster comes back empty', async () => {
  mockMembers = { data: [], error: null };
  await renderScreen();
  expect(await screen.findByText('You’re no longer in this group')).toBeTruthy();
});

test('shows an error with Try again when the first load fails, then recovers', async () => {
  mockMembers = { data: null, error: { message: 'offline' } };
  await renderScreen();
  expect(await screen.findByText('Couldn’t load this group’s members.')).toBeTruthy();
  mockMembers = { data: [maya], error: null };
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
  expect(await screen.findByText('Maya Kim')).toBeTruthy();
});

test('a realtime change reloads the list, and a failed refresh keeps the list on screen', async () => {
  mockMembers = { data: [maya], error: null };
  await renderScreen();
  expect(await screen.findByText('Maya Kim')).toBeTruthy();
  expect(screen.queryByText('Jordan Reyes')).toBeNull();

  mockMembers = { data: [maya, jordan], error: null };
  await act(async () => mockOnChange?.());
  expect(await screen.findByText('Jordan Reyes')).toBeTruthy();

  mockMembers = { data: null, error: { message: 'offline' } };
  await act(async () => mockOnChange?.());
  expect(await screen.findByText(/Couldn’t refresh the member list/)).toBeTruthy();
  expect(screen.getByText('Jordan Reyes')).toBeTruthy();
});

test('the channel is closed when the screen goes away', async () => {
  mockMembers = { data: [maya], error: null };
  const view = await renderScreen();
  await waitFor(() => expect(mockOnStatus).toBeDefined());
  await view.unmount();
  expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
});
