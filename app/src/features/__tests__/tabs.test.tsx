import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../../app/(tabs)/_layout';
import HomeTab from '../../app/(tabs)/index';

const mockHub: { data?: { plans: unknown[]; picks: unknown[] } } = {};
jest.mock('@/features/plans/usePlansHub', () => ({ usePlansHubQuery: () => mockHub, usePlansHubRealtime: () => {} }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
// Home stands in with the Plans hub until TEC-113; only its Your groups link matters here.
jest.mock('@/features/plans/PlansHubScreen', () => ({
  __esModule: true,
  default: function MockHub({ onGroups }: { onGroups: () => void }) {
    const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <MockPressable accessibilityRole="link" onPress={onGroups}><MockText>Your groups</MockText></MockPressable>;
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
  'groups/index': () => <Text>Groups screen</Text>,
}, { initialUrl: '/' });

// Every button on these stand-in screens is a bar item; React Navigation names each "<label>, tab, n of m".
const tabNames = () => screen.getAllByRole('button').map(item => item.props.accessibilityLabel);
const item = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, tab`) });

test('the bar shows Home and Discover only, with Home selected first', async () => {
  mockHub.data = { plans: [], picks: [] };
  await show();
  expect(tabNames()).toEqual(['Home, tab, 1 of 2', 'Discover, tab, 2 of 2']);
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

test('Your groups opens from Home', async () => {
  mockHub.data = { plans: [], picks: [] };
  await show();
  await act(async () => fireEvent.press(screen.getByRole('link', { name: 'Your groups' })));
  expect(screen).toHavePathname('/groups');
  expect(await screen.findByText('Groups screen')).toBeTruthy();
});

test('plans waiting on a reply badge the Home item and are said in words', async () => {
  mockHub.data = { plans: [awaiting], picks: [] };
  await show();
  expect(tabNames()).toEqual(['Home, 1 item needs your response', 'Discover, tab, 2 of 2']);
});
