import { beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { AlbumSection, audienceLine } from '../AlbumSection';

type Row = { id: string; user_id: string; kind: 'photo' | 'note'; storage_path: string | null; audience: 'plan' | 'group'; note: string | null; created_at: string };
type Result = { data: unknown; error: { message: string } | null };
let mockRows: Row[];
let mockAttended: 'yes' | 'no' | null;
let mockListError: boolean;
const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
const mockInvoke = jest.fn<(fn: string, options: { body: FormData }) => Promise<Result>>();
jest.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => table === 'album_items'
    ? { select: () => ({ eq: () => ({ order: async () => mockListError ? { data: null, error: { message: 'down' } } : { data: mockRows, error: null } }) }) }
    : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockAttended ? { attended: mockAttended } : null, error: null }) }) }) }) },
  storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://signed.example/${path}?t=1`, error: null })), error: null }) }) },
  rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
  functions: { invoke: (fn: string, options: { body: FormData }) => mockInvoke(fn, options) },
} }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));
const mockSave = jest.fn<() => Promise<{ uri: string; width: number; height: number; base64: string }>>();
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ saveAsync: () => mockSave() }) }) } }));
const mockPermission = jest.fn<() => Promise<{ granted: boolean }>>();
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: () => mockPermission(),
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///a.heic', width: 400, height: 300 }, { uri: 'file:///b.heic', width: 400, height: 300 }] }) }));

const PLAN = '6f1c2a40-8b1e-4d6a-9c3b-1a2b3c4d5e6f';
const INVITEES = [{ userId: 'me', name: 'Jordan' }, { userId: 'maya', name: 'Maya' }, { userId: 'sam', name: 'Sam' }, { userId: 'priya', name: 'Priya' }];
const row = (over: Partial<Row>): Row => ({ id: 'i1', user_id: 'maya', kind: 'photo', storage_path: `${PLAN}/maya/a.jpg`, audience: 'plan', note: null, created_at: '2026-11-21T20:00:00Z', ...over });
const show = async () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <AlbumSection planId={PLAN} userId="me" invitees={INVITEES} groupName="Friday Crew" hasGroup /></QueryClientProvider>);

beforeEach(() => {
  mockRows = []; mockAttended = 'yes'; mockListError = false; mockUuid = 0;
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockInvoke.mockReset().mockImplementation(async (_fn, { body }) => ({ data: { path: `${PLAN}/me/${String(body.get('client_key'))}.jpg` }, error: null }));
  mockSave.mockReset().mockResolvedValue({ uri: 'file:///out.jpg', width: 400, height: 300, base64: 'AAAA' });
  mockPermission.mockReset().mockResolvedValue({ granted: true });
});

test('the audience line names the number of people on the plan', () => {
  expect(audienceLine(4)).toBe('Visible to the 4 people on this plan');
  expect(audienceLine(1)).toBe('Visible to the 1 person on this plan');
});

test('empty: people who went are invited to add the first one', async () => {
  await show();
  expect(await screen.findByText('No photos yet')).toBeTruthy();
  expect(screen.getByText('Add the first one.')).toBeTruthy();
  expect(screen.getByText('Visible to the 4 people on this plan')).toBeTruthy();
  expect(screen.getByLabelText('Add to the album')).toBeTruthy();
});

test('empty for someone who did not go: no Add button, and the reason in words', async () => {
  mockAttended = 'no';
  await show();
  expect(await screen.findByText('Only people who went can add photos.')).toBeTruthy();
  expect(screen.queryByLabelText('Add to the album')).toBeNull();
});

test('ready: photo tiles are labelled with who added them, notes show their text, shared items say so', async () => {
  mockRows = [row({}), row({ id: 'i2', user_id: 'me', audience: 'group', storage_path: `${PLAN}/me/b.jpg` }), row({ id: 'i3', kind: 'note', storage_path: null, note: 'Golden hour on the dock' })];
  await show();
  expect(await screen.findByLabelText('Photo added by Maya')).toBeTruthy();
  expect(screen.getByLabelText('Photo added by You, shared with group')).toBeTruthy();
  expect(screen.getByLabelText('Note from Maya: Golden hour on the dock')).toBeTruthy();
});

test('error with nothing loaded offers Try again', async () => {
  mockListError = true;
  await show();
  expect(await screen.findByText('Couldn’t load the album.')).toBeTruthy();
  mockListError = false;
  await fireEvent.press(screen.getByLabelText('Try again'));
  expect(await screen.findByText('No photos yet')).toBeTruthy();
});

test('adding photos and a note re-encodes, uploads with a client key, then posts each; the note is its own item', async () => {
  await show();
  await fireEvent.press(await screen.findByLabelText('Add to the album'));
  expect((await screen.findAllByText('Visible to the 4 people on this plan')).length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByLabelText('Choose photos'));
  await waitFor(() => expect(screen.getAllByLabelText('Photo to add')).toHaveLength(2));
  expect(screen.getByText('2 of 20 photos. JPEG, PNG, HEIC or WebP, up to 15 MB each.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Golden hour on the dock');
  expect(screen.getByText('23 of 500')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Add to album'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
  const posts = mockRpc.mock.calls.filter(c => c[0] === 'add_album_item').map(c => c[1]);
  await waitFor(() => expect(mockRpc.mock.calls.filter(c => c[0] === 'add_album_item')).toHaveLength(3));
  expect(posts[0]).toMatchObject({ plan_id: PLAN, kind: 'note', note: 'Golden hour on the dock', storage_path: null });
  const photos = mockRpc.mock.calls.filter(c => c[0] === 'add_album_item' && c[1].kind === 'photo').map(c => c[1]);
  expect(photos).toHaveLength(2);
  for (const p of photos) expect(p.storage_path).toBe(`${PLAN}/me/${String(p.client_key)}.jpg`);
  expect(new Set(photos.map(p => p.client_key)).size).toBe(2);
  const body = mockInvoke.mock.calls[0][1].body;
  expect(body.get('plan_id')).toBe(PLAN);
});

test('a failed upload stays a draft that is not posted; Retry uses the same key and then posts it', async () => {
  mockInvoke.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network'));
  await show();
  await fireEvent.press(await screen.findByLabelText('Add to the album'));
  await fireEvent.press(screen.getByLabelText('Choose photos'));
  await waitFor(() => expect(screen.getAllByLabelText('Photo to add')).toHaveLength(2));
  await fireEvent.press(screen.getByLabelText('Add to album'));
  expect(await screen.findByText(/2 photos didn’t upload. They’re saved here as drafts and aren’t posted. Nobody else can see them./)).toBeTruthy();
  expect(screen.getAllByLabelText('Photo not posted')).toHaveLength(2);
  expect(mockRpc.mock.calls.filter(c => c[0] === 'add_album_item')).toHaveLength(0);
  const firstKeys = mockInvoke.mock.calls.map(c => String(c[1].body.get('client_key')));
  await fireEvent.press(screen.getByLabelText('Retry'));
  await waitFor(() => expect(mockRpc.mock.calls.filter(c => c[0] === 'add_album_item')).toHaveLength(2));
  expect(mockInvoke.mock.calls.slice(2).map(c => String(c[1].body.get('client_key')))).toEqual(firstKeys);
  await waitFor(() => expect(screen.queryByText(/didn’t upload/)).toBeNull());
});

test('Remove drafts drops failed photos without posting anything', async () => {
  mockInvoke.mockRejectedValue(new Error('network'));
  await show();
  await fireEvent.press(await screen.findByLabelText('Add to the album'));
  await fireEvent.press(screen.getByLabelText('Choose photos'));
  await waitFor(() => expect(screen.getAllByLabelText('Photo to add')).toHaveLength(2));
  await fireEvent.press(screen.getByLabelText('Add to album'));
  await fireEvent.press(await screen.findByLabelText('Remove drafts'));
  await waitFor(() => expect(screen.queryByLabelText('Photo not posted')).toBeNull());
  expect(mockRpc).not.toHaveBeenCalledWith('add_album_item', expect.anything());
});

test('photo access denied: says so, offers iPhone Settings, and the note still posts', async () => {
  mockPermission.mockResolvedValue({ granted: false });
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await show();
  await fireEvent.press(await screen.findByLabelText('Add to the album'));
  await fireEvent.press(screen.getByLabelText('Choose photos'));
  expect(await screen.findByText('Photos are off for Sidequest. Turn them on in iPhone Settings. You can still add a note.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Open iPhone Settings'));
  await waitFor(() => expect(settings).toHaveBeenCalled());
  await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Fun day');
  await fireEvent.press(screen.getByLabelText('Add to album'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('add_album_item', expect.objectContaining({ kind: 'note', note: 'Fun day' })));
  expect(mockInvoke).not.toHaveBeenCalled();
});

test('your own photo: Share with group asks first with its own warning, then shares', async () => {
  mockRows = [row({ id: 'mine', user_id: 'me', storage_path: `${PLAN}/me/a.jpg` })];
  await show();
  await fireEvent.press(await screen.findByLabelText('Photo added by You'));
  expect(await screen.findByText(/Added by You · visible to the 4 people on this plan/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Share with group'));
  expect(await screen.findByText('Share with Friday Crew?')).toBeTruthy();
  expect(screen.getByText('Current and future group members will see this photo.')).toBeTruthy();
  expect(screen.getByText('You can delete it at any time, but it can’t be limited to this plan again.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalledWith('share_album_item', expect.anything());
  await fireEvent.press(screen.getByLabelText('Share with group'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('share_album_item', { id: 'mine' }));
});

test('Keep on this plan goes back without sharing', async () => {
  mockRows = [row({ id: 'mine', user_id: 'me', storage_path: `${PLAN}/me/a.jpg` })];
  await show();
  await fireEvent.press(await screen.findByLabelText('Photo added by You'));
  await fireEvent.press(await screen.findByLabelText('Share with group'));
  await fireEvent.press(screen.getByLabelText('Keep on this plan'));
  expect(await screen.findByText(/Added by You/)).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalledWith('share_album_item', expect.anything());
});

test('your own photo: Delete asks first, then deletes and refreshes the album', async () => {
  mockRows = [row({ id: 'mine', user_id: 'me', storage_path: `${PLAN}/me/a.jpg` })];
  await show();
  await fireEvent.press(await screen.findByLabelText('Photo added by You'));
  await fireEvent.press(await screen.findByLabelText('Delete photo'));
  expect(await screen.findByText('It disappears from everyone’s phone and the album. This can’t be undone.')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalledWith('delete_album_item', expect.anything());
  mockRows = [];
  await fireEvent.press(screen.getByLabelText('Delete photo'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('delete_album_item', { id: 'mine' }));
  expect(await screen.findByText('No photos yet')).toBeTruthy();
});

test('someone else’s photo: Report hides it for you, says so, and has no Delete or Share', async () => {
  mockRows = [row({})];
  await show();
  await fireEvent.press(await screen.findByLabelText('Photo added by Maya'));
  expect(screen.queryByLabelText('Delete photo')).toBeNull();
  expect(screen.queryByLabelText('Share with group')).toBeNull();
  await fireEvent.press(await screen.findByLabelText('Report photo'));
  expect(await screen.findByText('It will be hidden for you right away, and a reviewer will check it.')).toBeTruthy();
  mockRows = [];
  await fireEvent.press(screen.getByLabelText('Report photo'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('report_album_item', { id: 'i1' }));
  expect(await screen.findByText('Reported. It’s hidden for you now.')).toBeTruthy();
});

test('a server refusal shows words under the button', async () => {
  mockRows = [row({})];
  mockRpc.mockResolvedValue({ data: null, error: { message: 'not_found' } });
  await show();
  await fireEvent.press(await screen.findByLabelText('Photo added by Maya'));
  await fireEvent.press(await screen.findByLabelText('Report photo'));
  await fireEvent.press(screen.getByLabelText('Report photo'));
  expect(await screen.findByText('That item isn’t there any more.')).toBeTruthy();
});
