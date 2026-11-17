import { Stack } from 'expo-router';

// A layout makes `dev` one route, so the root layout's guards (signed in, and __DEV__) cover these screens.
export default function DevLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
