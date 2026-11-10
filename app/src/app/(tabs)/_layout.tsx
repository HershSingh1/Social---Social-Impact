import { Tabs } from 'expo-router';
import { useColors } from '@/shared/ui';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="plans" options={{ title: 'Plans' }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
    </Tabs>
  );
}
