import { Tabs } from 'expo-router';
import { color } from '@/ui/theme';
import { buildPlansHub } from '@/features/plans/hub';
import { usePlansHubQuery, usePlansHubRealtime } from '@/features/plans/usePlansHub';

export default function TabsLayout() {
  const query = usePlansHubQuery();
  usePlansHubRealtime();
  const badgeCount = query.data ? buildPlansHub(query.data).badgeCount : 0;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: color.primary, headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="plans" options={{
        title: 'Plans',
        tabBarBadge: badgeCount || undefined,
        tabBarBadgeStyle: { backgroundColor: color.primary, color: color.onPrimary },
        tabBarAccessibilityLabel: badgeCount ? `Plans, ${badgeCount} items need your response` : 'Plans',
      }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
    </Tabs>
  );
}
