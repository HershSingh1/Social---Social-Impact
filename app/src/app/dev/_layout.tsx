import { Stack } from 'expo-router';

// A layout makes `dev` one route, so the Stack.Protected guard in the root layout covers these screens.
export default function DevLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
