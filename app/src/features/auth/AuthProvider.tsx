import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { AuthContext, type AuthStatus } from './authContext';
import { loadOnboarding, type OnboardingState } from './onboarding';

export { useOptionalAuth } from './authContext';
export type { AuthStatus } from './authContext';

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [onboarding, setOnboarding] = useState<OnboardingState>({ step: 1, needsUsername: false });

  const check = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) { setStatus('signed-out'); return; }
    try {
      const found = await loadOnboarding(next.user.id);
      setOnboarding(found);
      setStatus(found.step === 'done' ? 'ready' : 'needs-profile');
    } catch { setStatus('error'); }
  }, []);

  useEffect(() => {
    // supabase-js keeps the session in AsyncStorage, so it survives restarts.
    void supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void check(next);
      else if (next) setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [check]);

  const refresh = useCallback(() => check(session), [check, session]);
  return <AuthContext.Provider value={{ status, session, onboarding, refresh }}>{children}</AuthContext.Provider>;
}

// A join code or link opened before sign-in is kept here and opened right after (D1).
const PENDING_KEY = 'sidequest.pendingLink';
export const savePendingLink = (path: string) => AsyncStorage.setItem(PENDING_KEY, path);
export async function takePendingLink(): Promise<string | null> {
  const path = await AsyncStorage.getItem(PENDING_KEY);
  if (path) await AsyncStorage.removeItem(PENDING_KEY);
  return path;
}
