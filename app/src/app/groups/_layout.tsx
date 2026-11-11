import { Stack } from 'expo-router';

export default function GroupsLayout() {
  return <Stack screenOptions={{ headerShown: false }}>
    {/* The create sheet slides up over whatever opened it, so the screen behind stays visible. */}
    <Stack.Screen name="new" options={{ presentation: 'transparentModal', animation: 'none' }} />
  </Stack>;
}
