import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type Query<T> = { data?: T; isPending: boolean; isError: boolean; refetch: jest.Mock<() => Promise<unknown>> };
const query = <T,>(over: Partial<Query<T>> = {}): Query<T> => ({ isPending: false, isError: false, refetch: jest.fn(async () => ({})), ...over });

let mockHub: Query<{ plans: unknown[]; picks: unknown[] }>;
let mockGroups: Query<unknown[]>;
let mockName: Query<string | null>;
jest.mock('@/features/plans/usePlansHub', () => ({ usePlansHubQuery: () => mockHub }));
jest.mock('@/features/groups/useMyGroups', () => ({ useMyGroups: () => mockGroups }));
jest.mock('../useHome', () => ({
  useDisplayName: () => mockName,
  useHomeRealtime: () => {},
  useUpNextDetails: () => ({ data: { imageUrl: null, goingCount: 4, going: [{ id: 'a', name: 'Ana' }] } }),
}));

const future = (days: number, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
const plan = (over: object) => ({
  id: 'p1', experienceName: 'Comedy Night at Cap City', groupName: 'Friday Crew', state: 'sent', viewerStatus: 'going',
  startAt: future(2), endAt: future(2, 2), ...over,
});
const crew = { id: 'g1', name: 'Friday Crew', memberCount: 4, faces: [], next: '',
  nextPlan: { id: 'p1', name: 'Comedy Night', startAt: future(2) } };

beforeEach(() => {
  jest.clearAllMocks();
  mockName = query({ data: 'Hersh' });
  mockGroups = query({ data: [crew] });
  mockHub = query({ data: { plans: [plan({})], picks: [{ id: 'k1', title: 'Saturday plans', groupName: 'Roommates', state: 'open',
    deadline: future(0, 5), viewerComplete: false }] } });
});

const show = () => render(<HomeScreen userId="me" />);

test('Ready: greeting, Up next card, Needs your input and Your groups, each opening its screen', async () => {
  await show();
  expect(screen.getByRole('header', { name: 'Hi, Hersh' })).toBeTruthy();
  expect(screen.getByText('Confirmed')).toBeTruthy();
  expect(screen.getByText('4 going')).toBeTruthy();
  expect(screen.getByText(/CST|CDT/)).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'View plan, Comedy Night at Cap City' })));
  expect(mockPush).toHaveBeenCalledWith('/plan/p1');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Vote: Vote on Saturday plans' })));
  expect(mockPush).toHaveBeenCalledWith('/pick/k1');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: /^Friday Crew, Plan confirmed/ })));
  expect(mockPush).toHaveBeenCalledWith('/groups/g1');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Join with code' })));
  expect(mockPush).toHaveBeenCalledWith('/join');
});

test('a plan waiting on an RSVP gets an Answer button and counts toward the total', async () => {
  mockHub = query({ data: { plans: [plan({ id: 'p2', viewerStatus: 'awaiting' })], picks: [] } });
  await show();
  expect(screen.getByLabelText('1 waiting')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Answer: RSVP to Comedy Night at Cap City' })));
  expect(mockPush).toHaveBeenCalledWith('/plan/p2');
  // The plan is not confirmed for the viewer yet, so Up next is empty.
  expect(screen.getByText('No plan coming up')).toBeTruthy();
});

test('Empty: no plans, nothing waiting, no groups', async () => {
  mockHub = query({ data: { plans: [], picks: [] } });
  mockGroups = query({ data: [] });
  await show();
  expect(screen.getByText('No plan coming up')).toBeTruthy();
  expect(screen.getByText(/all caught up/)).toBeTruthy();
  expect(screen.getByText('No groups yet')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create a group' })));
  expect(mockPush).toHaveBeenCalledWith('/groups/new');
});

test('Loading shows progress in words', async () => {
  mockHub = query({ isPending: true });
  mockGroups = query({ isPending: true });
  await show();
  expect(screen.getByText('Loading your plans…')).toBeTruthy();
  expect(screen.getByText('Loading your groups…')).toBeTruthy();
});

test('Error with nothing loaded offers Try again; with data loaded it keeps what was on screen', async () => {
  mockHub = query({ isError: true });
  mockGroups = query({ isError: true, data: [crew] });
  await show();
  expect(screen.getByText('Couldn’t load your plans.')).toBeTruthy();
  expect(screen.getByText(/Couldn’t refresh your groups/)).toBeTruthy();
  expect(screen.getByText('Friday Crew')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getAllByRole('button', { name: 'Try again' })[0]));
  expect(mockHub.refetch).toHaveBeenCalled();
});

test('pulling to refresh reloads plans, groups and the name', async () => {
  await show();
  await act(async () => { screen.getByTestId('home-scroll').props.refreshControl.props.onRefresh(); });
  expect(mockHub.refetch).toHaveBeenCalled();
  expect(mockGroups.refetch).toHaveBeenCalled();
  expect(mockName.refetch).toHaveBeenCalled();
});
