import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StartPlanButton } from '../StartPlanButton';

type Group = { id: string; name: string; memberCount: number };
let mockGroups: { data?: Group[]; isPending: boolean; refetch: () => Promise<unknown> };
const mockPush = jest.fn();
jest.mock('../../groups/useMyGroups', () => ({ useMyGroups: () => mockGroups }));
jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }));
jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use import
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const loaded = (data: Group[]) => ({ data, isPending: false, refetch: async () => {} });
const crew = { id: 'g1', name: 'Saturday crew', memberCount: 4 };
const tacos = { id: 'g2', name: 'Taco Tuesday', memberCount: 1 };
const inset = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const ui = () => <SafeAreaProvider initialMetrics={inset}><StartPlanButton experienceId="e1" userId="maya" /></SafeAreaProvider>;
const show = () => render(ui());
const tapStart = () => act(async () => fireEvent.press(screen.getByRole('button', { name: 'Start a plan' })));

beforeEach(() => { mockPush.mockReset(); });

describe('Start a plan on Detail', () => {
  test('with one group, opens the draft for that group and activity', async () => {
    mockGroups = loaded([crew]);
    await show();
    await tapStart();
    expect(mockPush).toHaveBeenCalledWith('/plan/new?group=g1&experience=e1');
    expect(screen.queryByText('Which group is this for?')).toBeNull();
  });

  test('with several groups, asks which one and opens the draft for the chosen group', async () => {
    mockGroups = loaded([crew, tacos]);
    await show();
    await tapStart();
    expect(screen.getByText('Which group is this for?')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Taco Tuesday, 1 member' })));
    expect(mockPush).toHaveBeenCalledWith('/plan/new?group=g2&experience=e1');
  });

  test('with no groups, offers Create group instead of an error', async () => {
    mockGroups = loaded([]);
    await show();
    await tapStart();
    expect(screen.getByText('No groups yet')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create group' })));
    expect(mockPush).toHaveBeenCalledWith('/groups/new');
  });

  test('tapped before the groups load: one group still goes straight through once they arrive', async () => {
    mockGroups = { isPending: true, refetch: async () => {} };
    const view = await show();
    await tapStart();
    expect(screen.getByLabelText('Loading your groups…')).toBeTruthy();
    mockGroups = loaded([crew]);
    await act(async () => view.rerender(ui()));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/plan/new?group=g1&experience=e1');
  });

  test('when the groups fail to load, says so and offers Try again', async () => {
    mockGroups = { isPending: false, refetch: async () => {} };
    await show();
    await tapStart();
    expect(screen.getByText('Couldn’t load your groups.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
