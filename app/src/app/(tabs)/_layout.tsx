import { Tabs } from 'expo-router';
import { FiltersProvider } from '@/features/discovery';
import { color } from '@/ui/theme';

export default function TabsLayout() {
  return (
    // One set of Activity and Price filters for the Map and List.
    <FiltersProvider>
      <Tabs screenOptions={{ tabBarActiveTintColor: color.primary, headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Map' }} />
        <Tabs.Screen name="plans" options={{ title: 'Plans' }} />
        <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
      </Tabs>
    </FiltersProvider>
  );
}
