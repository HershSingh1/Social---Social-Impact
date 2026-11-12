import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { draftHref, loadSavedDrafts } from '../drafts';
import PlansHubScreen from '../PlansHubScreen';

type Result = { data: unknown; error: { message: string } | null };
let mockGroups: { id: string; name: string }[] = [];
let mockExperiences: { id: string; name: string }[] = [];
let mockPlans: unknown[] = [];
const mockPush = jest.fn();
function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq']) b[m] = () => b;
  const result = (): Result => ({ data: table === 'groups' ? mockGroups : table === 'experiences' ? mockExperiences : table === 'plans' ? mockPlans : [], error: null });
  b.then = (resolve: (r: Result) => unknown) => Promise.resolve(result()).then(resolve);
  return b;
}
jest.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  auth: { getUser: async () => ({ data: { user: { id: 'maya' } }, error: null }) },
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  removeChannel: async () => {},
} }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href), navigate: jest.fn() }),
  useFocusEffect: () => {},
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const draft = (over: Record<string, unknown> = {}) => JSON.stringify({ groupId: 'g1', experienceId: 'e1', clientKey: 'k1',
  start: '2099-11-14T16:00:00Z', end: '2099-11-14T18:00:00Z', meetingPoint: 'Door', note: '', recipients: [], ...over });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPush.mockReset();
  mockGroups = [{ id: 'g1', name: 'Saturday crew' }];
  mockExperiences = [{ id: 'e1', name: 'Clay and conversation' }];
  mockPlans = [];
});

describe('saved drafts', () => {
  test('lists the drafts on this phone with group and activity names', async () => {
    await AsyncStorage.setItem('sidequest.planDraft:g1:e1:-', draft());
    expect(await loadSavedDrafts()).toEqual([expect.objectContaining({ groupName: 'Saturday crew', experienceName: 'Clay and conversation', groupId: 'g1', experienceId: 'e1' })]);
  });
  test('ignores other storage keys and values that are not drafts', async () => {
    await AsyncStorage.setItem('sidequest.planSeen:p1', '{"revision":1}');
    await AsyncStorage.setItem('sidequest.planDraft:g1:e1:-', 'not json');
    expect(await loadSavedDrafts()).toEqual([]);
  });
  test('hides a draft from a group the signed-in person cannot read (someone else used this phone)', async () => {
    await AsyncStorage.setItem('sidequest.planDraft:g9:e1:-', draft({ groupId: 'g9' }));
    expect(await loadSavedDrafts()).toEqual([]);
  });
  test('opening a draft goes to the plan screen for the same group, activity and pick', () => {
    expect(draftHref({ groupId: 'g1', experienceId: 'e1' })).toBe('/plan/new?group=g1&experience=e1');
    expect(draftHref({ groupId: 'g1', experienceId: 'e1', pickId: 'p1' })).toBe('/plan/new?group=g1&experience=e1&pick=p1');
  });
});

describe('plans hub screen', () => {
  const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlansHubScreen /></QueryClientProvider>);
  const plan = (id: string, name: string, startAt: string, endAt: string) => ({ id, experience_name: name, state: 'sent', current_revision: 1,
    group: { name: 'Saturday crew' }, plan_revisions: [{ revision: 1, start_at: startAt, end_at: endAt }],
    rsvps: [{ user_id: 'maya', status: 'going', removed_at: null }] });

  test('shows a Drafts section; tapping a draft reopens it', async () => {
    await AsyncStorage.setItem('sidequest.planDraft:g1:e1:p1', draft({ pickId: 'p1' }));
    await show();
    expect(await screen.findByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Saved on this phone')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('link', { name: /^Draft: Clay and conversation/ })));
    expect(mockPush).toHaveBeenCalledWith('/plan/new?group=g1&experience=e1&pick=p1');
  });

  test('with only a draft, the hub is not the empty screen', async () => {
    await AsyncStorage.setItem('sidequest.planDraft:g1:e1:-', draft());
    await show();
    await screen.findByText('Drafts');
    expect(screen.queryByText('No plans yet')).toBeNull();
  });

  test('Past is collapsed until opened', async () => {
    const day = 86_400_000;
    mockPlans = [plan('p-old', 'Old picnic', new Date(Date.now() - 3 * day).toISOString(), new Date(Date.now() - 3 * day + 7_200_000).toISOString())];
    await show();
    const toggle = await screen.findByRole('button', { name: 'Past plans, 1, hidden' });
    expect(screen.queryByText('Old picnic')).toBeNull();
    await act(async () => fireEvent.press(toggle));
    expect(screen.getByRole('button', { name: 'Past plans, 1, shown' })).toBeTruthy();
    expect(screen.getByText('Old picnic')).toBeTruthy();
    expect(screen.getByText('You said Going')).toBeTruthy();
  });

  test('with nothing at all it still says No plans yet', async () => {
    await show();
    expect(await screen.findByText('No plans yet')).toBeTruthy();
  });
});
