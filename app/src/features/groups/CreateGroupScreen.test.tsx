import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateGroupScreen } from './CreateGroupScreen';
import { createGroup } from './api';

const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ isAccount: true, userId: 'u1' }) }));
jest.mock('./api', () => ({ createGroup: jest.fn() }));

const renderIt = () => render(<QueryClientProvider client={new QueryClient()}><CreateGroupScreen /></QueryClientProvider>);

beforeEach(() => jest.clearAllMocks());

describe('Create group (P0-03)', () => {
  it('blank name: error under the field, nothing sent', async () => {
    await renderIt();
    await fireEvent.press(screen.getByRole('button', { name: 'Create and get a join code' }));
    expect(await screen.findByText(/Give the group a name/)).toBeTruthy();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('trims the name, creates the group and opens it (where the join code is shown)', async () => {
    (createGroup as jest.Mock).mockResolvedValue({ group_id: 'g9', code: 'SQ7K2M', expires_at: '2026-11-24T00:00:00Z' });
    await renderIt();
    await fireEvent.changeText(screen.getByLabelText('Group name'), '  Saturday crew  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Create and get a join code' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/group/g9'));
    expect(createGroup).toHaveBeenCalledWith('Saturday crew');
  });

  it('keeps the typed name when the server refuses, and says why', async () => {
    (createGroup as jest.Mock).mockRejectedValue({ message: 'too_many_groups' });
    await renderIt();
    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Saturday crew');
    await fireEvent.press(screen.getByRole('button', { name: 'Create and get a join code' }));
    expect(await screen.findByText(/20 groups already/)).toBeTruthy();
    expect(screen.getByLabelText('Group name').props.value).toBe('Saturday crew');
  });

  it('cannot be double-submitted while a request is in flight', async () => {
    let resolve: (v: unknown) => void = () => {};
    (createGroup as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
    await renderIt();
    await fireEvent.changeText(screen.getByLabelText('Group name'), 'Saturday crew');
    const first = fireEvent.press(screen.getByRole('button', { name: 'Create and get a join code' }));
    const busy = await screen.findByRole('button', { name: /in progress/ });
    await fireEvent.press(busy); // a second tap while sending does nothing
    expect(createGroup).toHaveBeenCalledTimes(1);
    resolve({ group_id: 'g1', code: 'AAAAAA', expires_at: '2026-11-24T00:00:00Z' });
    await first;
  });
});
