// Bottom bar from Figma 2.1 Home (node 28:3386) and 4.3 Map View (node 28:4763) in file MkYNxuYFuktTR0yGExJnK7.
// Figma draws five items: Home, Discover, +, Activity and Profile. D11 leaves out Activity (6.1, not now) and
// Profile (6.3 is drawn but the screen is TEC-98). The + opens the PRO-15 suggestion form (TEC-100).
import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { FiltersProvider } from '@/features/discovery';
import { color, size, type } from '@/ui/theme';
import { buildPlansHub } from '@/features/plans/hub';
import { usePlansHubQuery, usePlansHubRealtime } from '@/features/plans/usePlansHub';

const activeTint = color.primary;
const inactiveTint = color.textSecondary;

function tabIcon(name: ComponentProps<typeof Feather>['name']) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return <Feather name={name} size={size.tabIcon} color={focused ? activeTint : inactiveTint} />;
  };
}

// The label's line height is left out so it can grow with the text size setting.
const { lineHeight: _fixed, ...tabLabel } = type.tab;

// With no badge, React Navigation's own label is used ("Home, tab, 1 of 2").
function homeAccessibilityLabel(badgeCount: number) {
  if (!badgeCount) return undefined;
  return `Home, ${badgeCount} ${badgeCount === 1 ? 'item needs' : 'items need'} your response`;
}

export default function TabsLayout() {
  const query = usePlansHubQuery();
  usePlansHubRealtime();
  // The plans badge moved to Home with the Plans hub (TEC-45).
  const badgeCount = query.data ? buildPlansHub(query.data).badgeCount : 0;
  return (
    // One set of Activity and Price filters for the Map and List.
    <FiltersProvider>
      <Tabs screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarLabelStyle: tabLabel,
        tabBarStyle: { backgroundColor: color.bg, borderTopColor: color.line },
      }}>
        <Tabs.Screen name="index" options={{
          title: 'Home',
          tabBarIcon: tabIcon('home'),
          tabBarBadge: badgeCount || undefined,
          tabBarBadgeStyle: { backgroundColor: color.primary, color: color.onPrimary },
          tabBarAccessibilityLabel: homeAccessibilityLabel(badgeCount),
        }} />
        <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('compass') }} />
        <Tabs.Screen name="suggest" options={{ title: 'Suggest', tabBarIcon: tabIcon('plus-circle') }} />
      </Tabs>
    </FiltersProvider>
  );
}
