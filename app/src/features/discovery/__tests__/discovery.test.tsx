import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';
import { DiscoveryResults, EXPERIENCES_KEY, FilterBar, FiltersProvider, type Experience } from '..';

const mockOrder = jest.fn<() => Promise<{ data: unknown; error: unknown }>>();
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('../../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ order: () => mockOrder() }) }) } }));

const row = (name: string, category: string, price_kind: Experience['price_kind'], price_max: number | null): Experience =>
  ({ id: name, name, category, description: '', lat: null, lng: null, area: null, image_url: null, timing_kind: 'flexible', hours_text: null, booking_required: false,
    price_kind, price_min: price_max, price_max });
const CATALOG = [row('Mural walk', 'Art and walks', 'free', 0), { ...row('Pottery', 'Make something', 'exact', 38), hours_text: 'Open daily' },
  row('Trivia', 'Games and trivia', 'unknown', null)];

function setup(seed?: Experience[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (seed) client.setQueryData(EXPERIENCES_KEY, seed);
  return render(<QueryClientProvider client={client}><FiltersProvider>
    <FilterBar />
    <DiscoveryResults>{items => items.map(item => <Text key={item.id}>{item.name}</Text>)}</DiscoveryResults>
  </FiltersProvider></QueryClientProvider>);
}
const choose = (name: string) => fireEvent.press(screen.getByRole('checkbox', { name }));

beforeEach(() => { mockOrder.mockReset(); });

test('shows Loading, then the experiences', async () => {
  mockOrder.mockResolvedValue({ data: CATALOG, error: null });
  await setup();
  expect(screen.getByLabelText('Loading experiences…')).toBeTruthy();
  expect(await screen.findByText('Pottery')).toBeTruthy();
});

test('a failed first load shows an error with Try again, which loads the list', async () => {
  mockOrder.mockResolvedValueOnce({ data: null, error: new Error('offline') }).mockResolvedValue({ data: CATALOG, error: null });
  await setup();
  expect(await screen.findByRole('alert')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
  expect(await screen.findByText('Mural walk')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a failed refresh keeps the experiences on screen and offers Try again', async () => {
  mockOrder.mockResolvedValue({ data: null, error: new Error('offline') });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(EXPERIENCES_KEY, CATALOG, { updatedAt: 0 });
  await render(<QueryClientProvider client={client}><FiltersProvider>
    <DiscoveryResults>{items => items.map(item => <Text key={item.id}>{item.name}</Text>)}</DiscoveryResults>
  </FiltersProvider></QueryClientProvider>);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('Pottery')).toBeTruthy();
});

test('filters from the sheet narrow the list; unknown prices stay under a price cap', async () => {
  await setup(CATALOG);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  await choose('Under $25');
  expect(screen.getAllByText('Mural walk').length).toBeGreaterThan(0);
  expect(screen.queryByText('Pottery')).toBeNull();
  expect(screen.getAllByText('Trivia').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Filters, 1 applied' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Show 2 results' })).toBeTruthy();
});

test('"Include unknown prices" is on by default; off hides unknown prices under a cap, on brings them back', async () => {
  await setup(CATALOG);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  const toggle = screen.getByRole('switch', { name: 'Include unknown prices' });
  expect(toggle.props.value).toBe(true);
  await choose('Under $25');
  await fireEvent(toggle, 'valueChange', false);
  expect(screen.getByText('Off: hidden when a price limit is set')).toBeTruthy();
  expect(screen.queryByText('Trivia')).toBeNull();
  expect(screen.getByRole('button', { name: 'Show 1 result' })).toBeTruthy();
  await fireEvent(screen.getByRole('switch', { name: 'Include unknown prices' }), 'valueChange', true);
  expect(screen.getAllByText('Trivia').length).toBeGreaterThan(0);
});

test('a date option narrows the list and shows as a chip that turns it off', async () => {
  await setup(CATALOG);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  await choose('This weekend');
  expect(screen.getAllByText('Pottery').length).toBeGreaterThan(0);
  expect(screen.queryByText('Mural walk')).toBeNull();
  expect(screen.queryByText('Trivia')).toBeNull();
  await choose('Pick a date');
  expect(screen.queryByRole('checkbox', { name: 'Pick a date' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close Filters' }));
  expect(screen.getByRole('button', { name: 'Filters, 1 applied' })).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('checkbox', { checked: true })[0]);
  expect(screen.getAllByText('Mural walk').length).toBeGreaterThan(0);
});

test('no match shows "Nothing matches here"; Clear filters brings the list back', async () => {
  await setup(CATALOG);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  await choose('Outdoors');
  expect(screen.getByText('Nothing matches here')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.queryByText('Nothing matches here')).toBeNull();
  expect(screen.getAllByText('Pottery').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
});

test('a chip for each filter that is on turns it off', async () => {
  await setup(CATALOG);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  await choose('Free');
  await fireEvent.press(screen.getByRole('button', { name: 'Close Filters' }));
  await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Free' })[0]);
  expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
});

test('an empty catalog says so instead of "Nothing matches here"', async () => {
  await setup([]);
  expect(screen.getByText('No experiences yet')).toBeTruthy();
  expect(screen.queryByText('Nothing matches here')).toBeNull();
});
