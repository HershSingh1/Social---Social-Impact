import { fireEvent, render, screen } from '@testing-library/react-native';
import { StartPlanSection } from './StartPlanSection';
import { exp } from '@/features/discovery/testData';

const mockRouter = { push: jest.fn() };
let mockAuth: { isAccount: boolean };
let mockGroups: { data: unknown[] };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/groups/hooks', () => ({ useMyGroups: () => mockGroups }));

const sketch = exp({ id: 'sketch', name: 'Sketch and stroll' });
const crew = { id: 'g1', name: 'Saturday crew', memberCount: 6 };
const studio = { id: 'g2', name: 'UT design studio', memberCount: 9 };
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => { jest.resetAllMocks(); mockAuth = { isAccount: true }; mockGroups = { data: [crew] }; });

describe('Start a plan (Experience detail)', () => {
  it('a guest signs in and comes back to this experience', async () => {
    mockAuth = { isAccount: false };
    await render(<StartPlanSection experience={sketch} />);
    await press('Start a plan');
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in?returnTo=%2Fexperience%2Fsketch');
  });
  it('one group: straight to the draft', async () => {
    await render(<StartPlanSection experience={sketch} />);
    await press('Start a plan');
    expect(mockRouter.push).toHaveBeenCalledWith('/plan/new?experienceId=sketch&groupId=g1');
  });
  it('several groups: choose which', async () => {
    mockGroups = { data: [crew, studio] };
    await render(<StartPlanSection experience={sketch} />);
    await press('Start a plan');
    await fireEvent.press(screen.getByRole('radio', { name: /UT design studio/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/plan/new?experienceId=sketch&groupId=g2');
  });
  it('no groups: points to Friends', async () => {
    mockGroups = { data: [] };
    await render(<StartPlanSection experience={sketch} />);
    await press('Start a plan');
    expect(await screen.findByText(/Create or join a group first/)).toBeTruthy();
    await press('Go to Friends');
    expect(mockRouter.push).toHaveBeenCalledWith('/friends');
  });
});
