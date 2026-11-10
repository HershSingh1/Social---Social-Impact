import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PickBuilderScreen } from './PickBuilderScreen';
import { PickBuilderProvider, usePickBuilder } from './PickBuilder';
import { createPick } from './api';
import type { BuilderAction } from './builderState';
import type { PickExperience } from '@/types/database';

const mockRouter = { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
let mockAuth: { isAccount: boolean };
let mockGroups: Record<string, unknown>;
let mockOpen: { data: { id: string } | null | undefined };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/groups/hooks', () => ({ useMyGroups: () => mockGroups }));
jest.mock('./hooks', () => ({ useOpenPickForGroup: () => mockOpen }));
jest.mock('./api', () => ({ createPick: jest.fn() }));

const ex = (id: string, name: string): PickExperience => ({ id, name, category: 'outdoors', area: 'Zilker', price_kind: 'free', price_min: 0, price_max: 0, booking_required: false, timing_kind: 'flexible', meeting_point: 'Gate' });
const crew = { id: 'g1', name: 'Saturday crew', ownerId: 'u', memberCount: 6, memberNames: [] };
const studio = { id: 'g2', name: 'UT design studio', ownerId: 'u', memberCount: 9, memberNames: [] };

function Seed({ actions }: { actions: BuilderAction[] }) {
  const { dispatch } = usePickBuilder();
  useEffect(() => { actions.forEach(dispatch); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
const seeded = (...actions: BuilderAction[]) => render(
  <QueryClientProvider client={new QueryClient()}>
    <PickBuilderProvider><Seed actions={actions} /><PickBuilderScreen /></PickBuilderProvider>
  </QueryClientProvider>,
);
const two: BuilderAction[] = [
  { type: 'setGroup', groupId: 'g1' },
  { type: 'add', item: { experience: ex('a', 'Sketch and stroll'), proposedStart: null } },
  { type: 'add', item: { experience: ex('b', 'Barton Springs swim'), proposedStart: null } },
];
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.resetAllMocks();
  mockAuth = { isAccount: true };
  mockGroups = { data: [crew], isPending: false, isError: false, refetch: jest.fn() };
  mockOpen = { data: null };
});

describe('pick builder (P0-08)', () => {
  it('a guest is asked to sign in and comes back to the builder', async () => {
    mockAuth = { isAccount: false };
    await seeded();
    await press('Sign in');
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fpick%2Fnew');
  });

  it('with no groups it sends the person to Friends', async () => {
    mockGroups = { data: [], isPending: false, isError: false, refetch: jest.fn() };
    await seeded();
    await press('Go to Friends');
    expect(mockRouter.replace).toHaveBeenCalledWith('/friends');
  });

  it('needs at least 2 options before voting can open', async () => {
    await seeded(two[0], two[1]);
    expect(await screen.findByText('1 of 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open voting for 1 option' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Add at least one more to open voting.')).toBeTruthy();
  });

  it('opens voting with the options, the star (1-based) and a 24 hour deadline, then goes to the pick', async () => {
    (createPick as jest.Mock).mockResolvedValue('pick-9');
    await seeded(...two);
    await screen.findByText('2 of 5');
    await fireEvent.press(screen.getByRole('button', { name: 'Tie-breaker star for Barton Springs swim' }));
    const before = Date.now();
    await press('Open voting for 2 options');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/pick/pick-9'));
    const args = (createPick as jest.Mock).mock.calls[0][0];
    expect(args.groupId).toBe('g1');
    expect(args.options).toEqual([{ experience_id: 'a', proposed_start: null }, { experience_id: 'b', proposed_start: null }]);
    expect(args.starred).toBe(2);
    expect(Math.abs(args.deadline.getTime() - (before + 24 * 3_600_000))).toBeLessThan(5_000);
  });

  it('is blocked when the group already has an open pick, with a link to it', async () => {
    mockOpen = { data: { id: 'open-1' } };
    await seeded(...two);
    expect(await screen.findByText('Saturday crew already has an open pick')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open voting for 2 options/ }).props.accessibilityState.disabled).toBe(true);
    await press('View the open pick');
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/open-1');
  });

  it('shows the server refusal and a link when another pick got opened meanwhile', async () => {
    (createPick as jest.Mock).mockRejectedValue({ message: 'open_pick_exists', details: 'other-pick' });
    await seeded(...two);
    await screen.findByText('2 of 5');
    await press('Open voting for 2 options');
    expect(await screen.findByText('This group already has an open pick.')).toBeTruthy();
    await press('View the open pick');
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/other-pick');
    expect(screen.getByText('2 of 5')).toBeTruthy(); // the options are still there
  });

  it('removes an option and starts over', async () => {
    await seeded(...two);
    await screen.findByText('2 of 5');
    await press('Remove Sketch and stroll');
    expect(screen.queryByText('Sketch and stroll')).toBeNull();
    await press('Start over');
    expect(await screen.findByText(/No options yet/)).toBeTruthy();
  });

  it('a custom deadline under one hour is refused under the field', async () => {
    await seeded(...two);
    await screen.findByText('2 of 5');
    await fireEvent.press(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByText(/Closes .* Austin time/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Custom, selected' })).toBeTruthy();
  });

  it('someone in several groups can change group, which starts a fresh list', async () => {
    mockGroups = { data: [crew, studio], isPending: false, isError: false, refetch: jest.fn() };
    await seeded(...two);
    await screen.findByText('2 of 5');
    await press('Change group');
    await fireEvent.press(screen.getByRole('radio', { name: /UT design studio/ }));
    expect(await screen.findByText(/No options yet/)).toBeTruthy();
  });
});
