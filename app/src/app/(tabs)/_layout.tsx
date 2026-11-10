import { Tabs } from 'expo-router';
import { color } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: color.primary, headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="plans" options={{ title: 'Plans' }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
    </Tabs>
  );
}
