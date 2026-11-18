import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../../app/(tabs)/_layout';
import HomeTab from '../../app/(tabs)/index';

const mockHub: { data?: { plans: unknown[]; picks: unknown[] } } = {};
jest.mock('@/features/plans/usePlansHub', () => ({ usePlansHubQuery: () => mockHub, usePlansHubRealtime: () => {} }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
// The Home screen has its own tests; here it only has to stand in the first tab.
jest.mock('@/features/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));
jest.mock('@/features/home/HomeScreen', () => ({
  __esModule: true,
  default: function MockHome() {
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <MockText>Home screen</MockText>;
  },
}));

const awaiting = {
  id: 'p1', experienceName: 'Comedy Night', groupName: 'Friday Crew', state: 'sent', viewerStatus: 'awaiting',
  startAt: '2099-11-14T02:00:00Z', endAt: '2099-11-14T04:00:00Z',
};

const show = () => renderRouter({
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': HomeTab,
  '(tabs)/discover': () => <Text>Discover screen</Text>,
  '(tabs)/suggest': () => <Text>Suggest screen</Text>,
}, { initialUrl: '/' });

// Every button on these stand-in screens is a bar item; React Navigation names each "<label>, tab, n of m".
const tabNames = () => screen.getAllByRole('button').map(item => item.props.accessibilityLabel);
const item = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, tab`) });

test('the bar shows Home, Discover and the suggestion entry, with Home selected first', async () => {
  mockHub.data = { plans: [], picks: [] };
  await show();
  expect(tabNames()).toEqual(['Home, tab, 1 of 3', 'Discover, tab, 2 of 3', 'Suggest, tab, 3 of 3']);
  expect(item('Home').props.accessibilityState).toMatchObject({ selected: true });
});

test('Discover opens the Map and List and becomes the selected item', async () => {
  mockHub.data = { plans: [], picks: [] };
  await show();
  await act(async () => fireEvent.press(item('Discover')));
  expect(screen).toHavePathname('/discover');
  expect(screen.getByText('Discover screen')).toBeTruthy();
  expect(item('Discover').props.accessibilityState).toMatchObject({ selected: true });
});

test('Suggest opens the new listing form', async () => {
  mockHub.data = { plans: [], picks: [] };
  await show();
  await act(async () => fireEvent.press(item('Suggest')));
  expect(screen).toHavePathname('/suggest');
  expect(screen.getByText('Suggest screen')).toBeTruthy();
});

test('plans waiting on a reply badge the Home item and are said in words', async () => {
  mockHub.data = { plans: [awaiting], picks: [] };
  await show();
  expect(tabNames()).toEqual(['Home, 1 item needs your response', 'Discover, tab, 2 of 3', 'Suggest, tab, 3 of 3']);
});
