import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthGate, AuthProvider, useAuth } from '../features/auth';
import { NotificationHost } from '../features/notifications';
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
            {status => <>
              {status === 'ready' && <SignedInHost />}
              <Stack screenOptions={{ headerShown: false }}>
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
                <Stack.Screen name="plan-link" />
                <Stack.Screen name="pick/new" />
                <Stack.Screen name="pick/[id]" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="calendar-settings" />
                <Stack.Screen name="notification-settings" />
                <Stack.Screen name="preferences" />
                <Stack.Screen name="review" />
                <Stack.Screen name="username" options={{ presentation: 'modal' }} />
                <Stack.Screen name="quiz" options={{ presentation: 'modal' }} />
                {/* Developer screens (UI kit, filters demo) only exist in development builds. */}
                <Stack.Protected guard={__DEV__}>
                  <Stack.Screen name="dev" />
                </Stack.Protected>
              </Stack.Protected>
            </Stack></>}
          </AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Notifications are for signed-in people only; nothing here runs at sign-in or launch except re-registering an allowed phone.
function SignedInHost() {
  const { session } = useAuth();
  return session ? <NotificationHost userId={session.user.id} /> : null;
}
