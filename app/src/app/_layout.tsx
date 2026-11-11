import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthGate, AuthProvider } from '../features/auth';
import { useAppFonts } from '../ui/fonts';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded, fontError] = useAppFonts();
  // Wait for the fonts (a moment on first launch). If they fail to load, carry on with system fonts.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGate>
            {status => <Stack screenOptions={{ headerShown: false }}>
              {/* Nothing works signed out (D1). New signed-in routes go in the last group. */}
              <Stack.Protected guard={status === 'signed-out'}>
                <Stack.Screen name="welcome" />
                <Stack.Screen name="sign-in" />
              </Stack.Protected>
              <Stack.Protected guard={status === 'needs-profile'}>
                <Stack.Screen name="profile-setup" />
              </Stack.Protected>
              <Stack.Protected guard={status === 'ready'}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="groups" />
                <Stack.Screen name="join" />
                <Stack.Screen name="plan" />
                <Stack.Screen name="dev" />
              </Stack.Protected>
            </Stack>}
          </AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
