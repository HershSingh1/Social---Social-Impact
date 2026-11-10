import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddToPickSection } from './AddToPickSection';
import { PickBuilderProvider } from './PickBuilder';
import { addOption, fetchOpenPickForGroup } from './api';
import { exp } from '@/features/discovery/testData';

const mockRouter = { push: jest.fn() };
let mockAuth: { userId: string; isAccount: boolean };
let mockGroups: { data: unknown[] | undefined };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/groups/hooks', () => ({ useMyGroups: () => mockGroups }));
jest.mock('./api', () => ({ addOption: jest.fn(), fetchOpenPickForGroup: jest.fn() }));

const crew = { id: 'g1', name: 'Saturday crew', memberCount: 6 };
const studio = { id: 'g2', name: 'UT design studio', memberCount: 9 };
const sketch = exp({ id: 'sketch', name: 'Sketch and stroll' });
const swim = exp({ id: 'swim', name: 'Barton Springs swim' });

const renderIt = (e = sketch) => render(
  <QueryClientProvider client={new QueryClient()}><PickBuilderProvider><AddToPickSection experience={e} /></PickBuilderProvider></QueryClientProvider>,
);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.resetAllMocks();
  mockAuth = { userId: 'maya', isAccount: true };
  mockGroups = { data: [crew] };
  (fetchOpenPickForGroup as jest.Mock).mockResolvedValue(null);
});

describe('Add to group pick (Experience detail)', () => {
  it('a guest is sent to sign in and returned to this experience', async () => {
    mockAuth = { userId: 'g', isAccount: false };
    await renderIt();
    await press('Add to group pick');
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fexperience%2Fsketch');
  });

  it('with one group it adds straight to the pick being built', async () => {
    await renderIt();
    await press('Add to group pick');
    expect(await screen.findByText('Added to your group pick (1 of 5).')).toBeTruthy();
    await press('Review pick');
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/new');
  });

  it('adding the same experience twice is refused with a hint', async () => {
    await renderIt();
    await press('Add to group pick');
    await screen.findByText('Added to your group pick (1 of 5).');
    await press('Add to group pick');
    expect(await screen.findByText(/Already in your group pick/)).toBeTruthy();
  });

  it('with no groups it points to Friends', async () => {
    mockGroups = { data: [] };
    await renderIt();
    await press('Add to group pick');
    expect(await screen.findByText(/Create or join a group first/)).toBeTruthy();
    await press('Go to Friends');
    expect(mockRouter.push).toHaveBeenCalledWith('/friends');
  });

  it('someone in several groups chooses which one', async () => {
    mockGroups = { data: [crew, studio] };
    await renderIt();
    await press('Add to group pick');
    await fireEvent.press(screen.getByRole('radio', { name: /UT design studio/ }));
    expect(await screen.findByText('Added to your group pick (1 of 5).')).toBeTruthy();
    expect(fetchOpenPickForGroup).toHaveBeenCalledWith('g2');
  });

  it('when the group already has an open pick, a non-organizer is pointed to it (one open pick per group)', async () => {
    (fetchOpenPickForGroup as jest.Mock).mockResolvedValue({ id: 'open-1', organizer_id: 'someone-else' });
    await renderIt();
    await press('Add to group pick');
    expect(await screen.findByText('Saturday crew already has an open pick.')).toBeTruthy();
    expect(addOption).not.toHaveBeenCalled();
    await press('View pick');
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/open-1');
  });

  it('the organizer adds to their own open pick', async () => {
    (fetchOpenPickForGroup as jest.Mock).mockResolvedValue({ id: 'open-1', organizer_id: 'maya' });
    await renderIt(swim);
    await press('Add to group pick');
    await waitFor(() => expect(addOption).toHaveBeenCalledWith('open-1', 'swim'));
    expect(await screen.findByText(/Members who already voted will see a new option/)).toBeTruthy();
  });

  it('shows the server\'s reason when adding to the open pick fails', async () => {
    (fetchOpenPickForGroup as jest.Mock).mockResolvedValue({ id: 'open-1', organizer_id: 'maya' });
    (addOption as jest.Mock).mockRejectedValue({ message: 'too_many_options' });
    await renderIt();
    await press('Add to group pick');
    expect(await screen.findByText('A pick can have up to 5 options.')).toBeTruthy();
  });
});
