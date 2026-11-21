import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ExperienceDetail } from '../ExperienceDetailScreen';
import { FiltersProvider } from '../FiltersContext';
import { FilterSheet } from '../FilterBar';
import { NoMatches } from '../DiscoveryResults';
import { LocalSpotOwner } from '../LocalSpotOwner';
import { LocalSpotTags } from '../localSpots';
import ReviewQueueScreen from '../ReviewQueueScreen';
import SuggestionScreen from '../SuggestionScreen';
import { applyFilters, countActiveFilters, DEFAULT_FILTERS } from '../filters';
import { LISTING_MAX_BYTES, prepareListingPhoto } from '../listingPhoto';
import { EMPTY_SUGGESTION, draftFromExperience, submitSuggestion, validateSuggestion } from '../suggestions';

type Result = { data: unknown; error: { message: string } | null };
const mockRpc = jest.fn<(fn: string, args?: Record<string, unknown>) => Promise<Result>>();
let mockTables: Record<string, unknown>;
function mockBuilder(table: string) {
  const value: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) value[method] = () => value;
  value.maybeSingle = async () => ({ data: (mockTables[table] as unknown[] | null)?.[0] ?? null, error: null });
  value.then = (resolve: (r: Result) => unknown) => Promise.resolve({ data: mockTables[table] ?? [], error: null }).then(resolve);
  return value;
}
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: (fn: string, args?: Record<string, unknown>) => mockRpc(fn, args), from: (t: string) => mockBuilder(t) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'client-key' }));
jest.mock('../../auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('@/features/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ router: { push: (p: unknown) => mockPush(p), back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('@/features/bucket/WantToDo', () => ({ WantToDo: () => null }));
jest.mock('@/features/plans/StartPlanButton', () => ({ StartPlanButton: () => null }));
jest.mock('../SaveSheet', () => ({ SaveSheet: () => null }));
jest.mock('../saves', () => ({ useSaves: () => ({ data: undefined }), isSavedAnywhere: () => false }));
jest.mock('@/lib/analytics', () => ({ logEvent: () => undefined }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (fn: string, args?: Record<string, unknown>) => mockRpc(fn, args), from: (t: string) => mockBuilder(t) } }));
const mockChoose = jest.fn<(userId: string) => Promise<string | null>>();
jest.mock('../listingPhoto', () => ({ ...(jest.requireActual('../listingPhoto') as object), chooseListingPhoto: (u: string) => mockChoose(u) }));
const mockSave = jest.fn<() => Promise<{ uri: string; width: number; height: number; base64: string }>>();
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ saveAsync: () => mockSave() }) }) } }));
jest.mock('expo-image-picker', () => ({}));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (node: ReactNode) => <QueryClientProvider client={client()}><FiltersProvider>{node}</FiltersProvider></QueryClientProvider>;

beforeEach(() => {
  jest.clearAllMocks(); mockTables = {}; mockParams = {};
  mockRpc.mockImplementation(async fn => ({ data: fn === 'get_profile_cards' ? [{ user_id: 'dana', display_name: 'Dana' }] : fn === 'can_review_listings' ? true : 'id', error: null }));
});

const row = (over: Record<string, unknown> = {}) => ({ id: 'e1', name: 'Night swim', category: 'Outdoors', price_kind: 'free' as const, price_min: 0, price_max: 0, ...over });

// ---- filter
test('the Local spots filter hides every catalog row and counts as one applied filter', () => {
  const items = [row({ id: 'a', origin: 'catalog' }), row({ id: 'b', origin: 'local_spot' }), row({ id: 'c' })].map(i => ({ ...i, timing_kind: 'flexible' as const, sessions: null, hours_text: 'Open' }));
  expect(applyFilters(items, DEFAULT_FILTERS, '2026-11-20').map(i => i.id)).toEqual(['a', 'b', 'c']);
  expect(applyFilters(items, { ...DEFAULT_FILTERS, localOnly: true }, '2026-11-20').map(i => i.id)).toEqual(['b']);
  expect(countActiveFilters({ ...DEFAULT_FILTERS, localOnly: true })).toBe(1);
});

test('the filter sheet turns Local spots on, and an empty result says what to do', async () => {
  await render(wrap(<><FilterSheet visible onClose={() => {}} /><NoMatches /></>));
  expect(screen.getByText('Nothing matches here')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Local spots' })));
  expect(screen.getByText('No local spots yet')).toBeTruthy();
  expect(screen.getByText('Add one with the + button.')).toBeTruthy();
});

// ---- label
test('a local spot says so and names its author; a catalog row shows nothing', async () => {
  await render(wrap(<LocalSpotTags item={{ origin: 'local_spot', added_by: 'dana' }} />));
  expect(await screen.findByText('Added by Dana')).toBeTruthy();
  expect(screen.getByText('Local spot')).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith('get_profile_cards', { user_ids: ['dana'] });
});

test('without an author the label still shows, and a catalog row asks nothing', async () => {
  await render(wrap(<LocalSpotTags item={{ origin: 'local_spot', added_by: null }} />));
  expect(screen.getByText('Local spot')).toBeTruthy();
  expect(screen.queryByText(/Added by/)).toBeNull();
  await render(wrap(<LocalSpotTags item={{ origin: 'catalog', added_by: null }} />));
  expect(mockRpc).not.toHaveBeenCalled();
});

const detail = (over: Record<string, unknown> = {}) => ({ id: 'e1', name: 'Night swim at Deep Eddy', category: 'Outdoors', description: 'Cold spring water and a quiet deck after dark.',
  area: null, image_url: null, address: '401 Deep Eddy Ave', provider_name: null, price_kind: 'free', price_min: 0, price_max: 0, timing_kind: 'flexible', sessions: null,
  hours_text: 'Dusk', duration_min: 90, meeting_point: null, booking_required: null, booking_url: null, source: 'https://example.com', checked_on: null, status: 'published',
  origin: 'local_spot', added_by: 'dana', ...over });

test('Detail shows the label and author, and everyone can report outdated info', async () => {
  await render(wrap(<ExperienceDetail experience={detail() as never} userId="me" />));
  expect(await screen.findByText('Added by Dana')).toBeTruthy();
  expect(screen.getByText('Report outdated info')).toBeTruthy();
  expect(screen.queryByText('YOU ADDED THIS')).toBeNull();
});

test('only the author sees Edit and Ask for removal', async () => {
  await render(wrap(<ExperienceDetail experience={detail({ added_by: 'me' }) as never} userId="me" />));
  expect(screen.getByText('YOU ADDED THIS')).toBeTruthy();
  expect(screen.getByText('Ask for removal')).toBeTruthy();
});

test('Edit opens the form on the spot, and Ask for removal confirms first and then asks the server', async () => {
  await render(wrap(<LocalSpotOwner experienceId="e1" />));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Edit' })));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/suggest', params: { edit: 'e1' } });
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Ask for removal' })));
  expect(await screen.findByText('Ask for removal?')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalledWith('request_local_spot_removal', expect.anything());
  mockTables.local_spot_removal_requests = [{ experience_id: 'e1' }];
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Ask for removal' }).at(-1)!));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('request_local_spot_removal', { experience_id: 'e1' }));
  expect(await screen.findByText('Removal requested. A reviewer will take a look.')).toBeTruthy();
});

// ---- form data
const valid = { ...EMPTY_SUGGESTION, name: 'Night swim', description: 'Cold spring water and a quiet deck after dark.', category: 'Outdoors',
  location: '401 Deep Eddy Ave', hours: 'Dusk', duration: '90', priceKind: 'free' as const, source: 'https://example.com/deep-eddy' };

test('a local spot with a photo needs the confirmation; without a photo, or as a plain suggestion, it does not', () => {
  const withPhoto = { ...valid, imageUrl: 'https://x.test/a.jpg' };
  expect(validateSuggestion(withPhoto, 'local_spot')).toEqual({ photoConfirmed: 'Confirm you may share this photo.' });
  expect(validateSuggestion({ ...withPhoto, photoConfirmed: true }, 'local_spot')).toEqual({});
  expect(validateSuggestion(valid, 'local_spot')).toEqual({});
  expect(validateSuggestion(withPhoto)).toEqual({});
});

test('a plain suggestion makes exactly the call it always did; a local spot adds its kind and the confirmation', async () => {
  await submitSuggestion(valid, 'k1');
  expect(mockRpc).toHaveBeenLastCalledWith('submit_listing', { client_key: 'k1', payload: expect.not.objectContaining({ photo_confirmed: expect.anything() }) });
  expect(Object.keys(mockRpc.mock.calls.at(-1)![1]!)).toEqual(['client_key', 'payload']);
  await submitSuggestion({ ...valid, imageUrl: 'https://x.test/a.jpg', photoConfirmed: true }, 'k2', undefined, 'local_spot');
  expect(mockRpc).toHaveBeenLastCalledWith('submit_listing', expect.objectContaining({ client_key: 'k2', kind: 'local_spot',
    payload: expect.objectContaining({ image_url: 'https://x.test/a.jpg', photo_confirmed: true }) }));
  await submitSuggestion(valid, 'k3', undefined, 'local_spot', 'e1');
  expect(mockRpc).toHaveBeenLastCalledWith('submit_listing', expect.objectContaining({ payload: expect.objectContaining({ experience_id: 'e1' }) }));
});

test('the live spot becomes the edit form, with its photo to be confirmed again', () => {
  const draft = draftFromExperience({ name: 'Night swim', description: 'Cold spring water.', category: 'Outdoors', address: '401 Deep Eddy Ave', meeting_point: null,
    timing_kind: 'fixed', sessions: [{ start_local: '2026-11-22T20:00', end_local: '2026-11-22T22:00' }], hours_text: null, duration_min: 90, price_kind: 'estimated',
    price_min: 5, price_max: 9, source: 'https://example.com', image_url: 'https://x.test/a.jpg' });
  expect(draft).toMatchObject({ name: 'Night swim', location: '401 Deep Eddy Ave', timingKind: 'fixed', sessions: '2026-11-22T20:00 | 2026-11-22T22:00',
    priceKind: 'estimated', priceMin: '5', priceMax: '9', imageUrl: 'https://x.test/a.jpg', photoConfirmed: false });
});

// ---- form screen
test('the form switches to a local spot: its title, intro, labels and a photo that must be confirmed', async () => {
  mockChoose.mockResolvedValue('https://x.test/heron.jpg');
  await render(wrap(<SuggestionScreen />));
  await screen.findByText('Suggest an activity');
  expect(screen.getByLabelText('Photo URL (optional)')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'A local spot' })));
  expect(screen.getByText('Add a local spot')).toBeTruthy();
  expect(screen.getByText('Share a lesser-known place in Austin. A reviewer checks it before it goes on the map. It’s free to add.')).toBeTruthy();
  expect(screen.getByLabelText('What makes it special')).toBeTruthy();
  expect(screen.getByLabelText('Where (location or meeting point)')).toBeTruthy();
  expect(screen.queryByLabelText('Photo URL (optional)')).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Choose photo' })));
  expect(mockChoose).toHaveBeenCalledWith('me');
  expect(await screen.findByRole('button', { name: 'Change photo' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: /I may share this photo/ }).props.accessibilityState.checked).toBe(false);
});

test('sending a local spot with an unconfirmed photo is refused under the field and keeps what was typed', async () => {
  mockChoose.mockResolvedValue('https://x.test/heron.jpg');
  mockParams = { kind: 'local_spot' };
  await render(wrap(<SuggestionScreen />));
  await screen.findByText('Add a local spot');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Name'), 'Heron Point'));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Choose photo' })));
  await screen.findByRole('button', { name: 'Change photo' });
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send for review' })));
  expect(screen.getByText('Confirm you may share this photo.')).toBeTruthy();
  expect(screen.getByLabelText('Name').props.value).toBe('Heron Point');
  expect(mockRpc).not.toHaveBeenCalledWith('submit_listing', expect.anything());
});

test('a denied photo library says so, offers iPhone Settings, and the form still works', async () => {
  const { PhotoPermissionDenied } = jest.requireActual('../listingPhoto') as { PhotoPermissionDenied: new () => Error };
  mockChoose.mockRejectedValue(new PhotoPermissionDenied());
  mockParams = { kind: 'local_spot' };
  await render(wrap(<SuggestionScreen />));
  await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Choose photo' })));
  expect(await screen.findByText('Photos are off for Sidequest. Turn them on in iPhone Settings. You can still send without a photo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open iPhone Settings' })).toBeTruthy();
});

// ---- photo
test('a listing photo is re-encoded to JPEG at lower quality until it is under the 1 MB limit', async () => {
  const big = 'A'.repeat(Math.ceil((LISTING_MAX_BYTES + 100) * 4 / 3));
  mockSave.mockResolvedValueOnce({ uri: 'file:///big.jpg', width: 1600, height: 1200, base64: big })
    .mockResolvedValueOnce({ uri: 'file:///ok.jpg', width: 1600, height: 1200, base64: 'AAAA' });
  expect(await prepareListingPhoto({ uri: 'file:///IMG.HEIC', width: 4000, height: 3000 })).toEqual({ uri: 'file:///ok.jpg', width: 1600, height: 1200 });
  mockSave.mockResolvedValue({ uri: 'file:///big.jpg', width: 1, height: 1, base64: big });
  await expect(prepareListingPhoto({ uri: 'x', width: 10, height: 10 })).rejects.toThrow('photo_too_large');
  await expect(prepareListingPhoto({ uri: 'x', width: 0, height: 10 })).rejects.toThrow('invalid_photo');
});

// ---- reviewer
test('a reviewer sees removal requests and removes the spot from the map', async () => {
  mockTables.submissions = [];
  mockTables.listing_reports = [];
  mockTables.local_spot_removal_requests = [{ experience_id: 'e1', created_at: '2026-11-21T00:00:00Z', experiences: { name: 'Heron Point Overlook' } }];
  await render(wrap(<ReviewQueueScreen />));
  expect(await screen.findByText('Heron Point Overlook')).toBeTruthy();
  mockTables.local_spot_removal_requests = [];
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove Heron Point Overlook from the map' })));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('remove_local_spot', { experience_id: 'e1' }));
  expect(await screen.findByText('No removal requests waiting.')).toBeTruthy();
});

test('the queue marks a waiting local spot', async () => {
  mockTables.submissions = [{ id: 's1', author_id: 'dana', kind: 'local_spot', payload: { name: 'Heron Point Overlook' }, state: 'pending', reason: null, created_at: '', updated_at: '' }];
  mockTables.listing_reports = [];
  await render(wrap(<ReviewQueueScreen />));
  expect(await screen.findByText('Local spot')).toBeTruthy();
});
