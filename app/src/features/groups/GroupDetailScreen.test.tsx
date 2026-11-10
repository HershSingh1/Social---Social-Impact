import { render, screen, fireEvent } from '@testing-library/react-native';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GroupDetailScreen } from './GroupDetailScreen';

const mockRouter = { replace: jest.fn() };
let mockGroup: Record<string, unknown>, mockMembers: Record<string, unknown>, mockCode: Record<string, unknown>;
let mockHub: { hub: unknown };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, Stack: { Screen: () => null } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ userId: 'u-maya' }) }));
jest.mock('./hooks', () => ({ useGroup: () => mockGroup, useMembers: () => mockMembers, useJoinCode: () => mockCode }));
jest.mock('@/features/plans/useHub', () => ({ useHub: () => mockHub }));

const base = { isPending: false, isError: false, isRefetching: false, refetch: jest.fn() };
const members = [
  { user_id: 'u-maya', role: 'owner', joined_at: '1', profiles: { display_name: 'Maya', is_guest: false, avatar_path: null } },
  { user_id: 'u-jordan', role: 'member', joined_at: '2', profiles: { display_name: 'Jordan', is_guest: true, avatar_path: null } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGroup = { ...base, data: { id: 'g1', name: 'Saturday crew', owner_id: 'u-maya' } };
  mockMembers = { ...base, data: members };
  mockCode = { ...base, data: { code: 'SQ7K2M', expires_at: '2026-11-24T18:00:00Z' } };
  mockHub = { hub: null };
});

describe('Group detail (P0-03, P0-17)', () => {
  it('shows the roster with Owner and guest labels in words', async () => {
    await render(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByText('Maya (you)')).toBeTruthy();
    expect(screen.getByText('Jordan')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('guest')).toBeTruthy();
    expect(screen.getByText('2 joined. You own this group.')).toBeTruthy();
  });

  it('shows the 6-character join code and copies / shares the spec text', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await render(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByText('SQ7K2M')).toBeTruthy();
    expect(screen.getByLabelText('Join code S Q 7 K 2 M')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('SQ7K2M');
    expect(await screen.findByText('Code copied.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ message: 'Join Saturday crew on Sidequest with code SQ7K2M' });
  });

  it('a removed member sees "You\'re no longer in this group"', async () => {
    mockGroup = { ...base, data: null };
    await render(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByText("You're no longer in this group")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Friends' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/friends');
  });

  it('shows a skeleton while loading and a retry when the roster fails', async () => {
    mockGroup = { ...base, isPending: true, data: undefined };
    const { rerender } = await render(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();

    mockGroup = { ...base, data: { id: 'g1', name: 'Saturday crew', owner_id: 'u-maya' } };
    mockMembers = { ...base, isError: true, data: undefined };
    await rerender(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByText("Couldn't load the member list.")).toBeTruthy();
  });

  it('lists the group\'s open pick and only the plans the viewer is invited to, and says the rest stay hidden', async () => {
    const { buildHub } = require('@/features/plans/hub');
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const end = new Date(Date.now() + 3 * 86_400_000 + 5_400_000).toISOString();
    const plan = (id: string, groupId: string) => ({ id, groupId, groupName: 'X', experienceName: `Plan ${id}`, startAt: start, endAt: end, state: 'sent', status: 'going', isOrganizer: false });
    mockHub = { hub: buildHub([plan('mine', 'g1'), plan('other-group', 'g2')], [{ id: 'k', groupId: 'g1', groupName: 'Saturday crew', state: 'open', deadline: end, voted: false, optionCount: 3, winnerName: null }]) };
    await render(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByText('Vote needed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Plan mine/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Plan other-group/ })).toBeNull();
    expect(screen.getByText("Plans you weren't invited to stay hidden.")).toBeTruthy();
  });

  it('says "No plan yet" when there is nothing', async () => {
    await render(<GroupDetailScreen groupId="g1" />);
    expect(screen.getByText('No plan yet.')).toBeTruthy();
  });
});
