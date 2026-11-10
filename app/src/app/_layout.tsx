import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { PickBuilderProvider } from '@/features/picks/PickBuilder';
import { isBackendConfigured } from '@/shared/lib/env';
import { ErrorState, Screen, SkeletonList, Text, space, useColors } from '@/shared/ui';

function AuthGate({ children }: { children: ReactNode }) {
  const { status, retry } = useAuth();
  const c = useColors();
  if (status === 'loading') {
    return (
      <View style={[styles.fill, { backgroundColor: c.bg }]}>
        <Screen scroll={false}><SkeletonList rows={4} rowHeight={72} /></Screen>
      </View>
    );
  }
  if (status === 'error') {
    return (
      <Screen><ErrorState message="Couldn't connect to Sidequest." onRetry={retry} /></Screen>
    );
  }
  return <>{children}</>;
}

function SetupNeeded() {
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">Backend not configured</Text>
      <Text muted>
        Copy app/.env.example to app/.env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
        (printed by `npm run db:start`), then restart Metro.
      </Text>
    </Screen>
  );
}

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnReconnect: true } },
  }));
  const c = useColors();

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {!isBackendConfigured ? (
        <SetupNeeded />
      ) : (
        <QueryClientProvider client={client}>
          <AuthProvider>
            <AuthGate>
              <PickBuilderProvider>
              <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="join/index" options={{ title: 'Join a group' }} />
                <Stack.Screen name="join/[code]" options={{ title: 'Join a group' }} />
                <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
                <Stack.Screen name="experience/[id]" options={{ title: 'Experience' }} />
                <Stack.Screen name="pick/new" options={{ title: 'New group pick' }} />
                <Stack.Screen name="pick/[id]" options={{ title: 'Group pick' }} />
                <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
                <Stack.Screen name="create-group" options={{ presentation: 'modal', title: 'Create a group' }} />
              </Stack>
              </PickBuilderProvider>
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, padding: space.lg } });
