import { render } from '@testing-library/react-native';
import TabsLayout from '@/app/(tabs)/_layout';

let mockHub: { hub: { badge: number } | null };
const mockScreens: Record<string, Record<string, unknown>> = {};

jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Tabs.Screen = ({ name, options }: { name: string; options: Record<string, unknown> }) => { mockScreens[name] = options; return null; };
  return { Tabs };
});
jest.mock('@/features/plans/useHub', () => ({ useHub: () => mockHub }));

describe('Plans tab badge (P0-16)', () => {
  it('shows the count of plans needing a response plus picks not yet voted, with a spoken label', async () => {
    mockHub = { hub: { badge: 3 } };
    await render(<TabsLayout />);
    expect(mockScreens.plans.tabBarBadge).toBe(3);
    expect(mockScreens.plans.tabBarAccessibilityLabel).toBe('Plans, 3 need your response');
  });
  it('shows no badge when nothing needs a response (or while loading)', async () => {
    mockHub = { hub: { badge: 0 } };
    await render(<TabsLayout />);
    expect(mockScreens.plans.tabBarBadge).toBeUndefined();
    mockHub = { hub: null };
    await render(<TabsLayout />);
    expect(mockScreens.plans.tabBarBadge).toBeUndefined();
    expect(mockScreens.plans.tabBarAccessibilityLabel).toBe('Plans');
  });
});
