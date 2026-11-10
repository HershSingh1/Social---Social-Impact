import { Tabs } from 'expo-router';
import { useColors } from '@/shared/ui';
import { useHub } from '@/features/plans/useHub';

export default function TabsLayout() {
  const c = useColors();
  const { hub } = useHub();
  const badge = hub?.badge ?? 0;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarAccessibilityLabel: badge > 0 ? `Plans, ${badge} need your response` : 'Plans',
        }}
      />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
    </Tabs>
  );
}
