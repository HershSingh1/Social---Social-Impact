import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase';
import type { Profile } from '@/types/database';
import { fetchProfile } from './api';

type Status = 'loading' | 'ready' | 'error';

type AuthValue = {
  status: Status;
  session: Session | null;
  userId: string | null;
  /** Signed in with Apple or an email code (not an anonymous guest). */
  isAccount: boolean;
  profile: Profile | null | undefined; // undefined while loading, null when the person has no profile yet
  retry: () => void;
  /** Fetch the profile fresh (after sign-in / set_profile). */
  loadProfile: () => Promise<Profile | null>;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Every device always has a session: on first launch we create an anonymous (guest) user so the catalog and RPCs
 * work without a sign-in wall. Signing in later upgrades that same user (see api.ts), so nothing is lost.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      const id = next?.user.id ?? null;
      // a different person on this device: never show the previous user's cached data
      if (lastUser.current && id !== lastUser.current) qc.clear();
      if (id) lastUser.current = id;
      setSession(next);
      if (event === 'SIGNED_OUT') setAttempt((a) => a + 1); // get a fresh guest session
    });

    (async () => {
      setStatus('loading');
      try {
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (!alive) return;
        if (existing) { setSession(existing); setStatus('ready'); return; }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!alive) return;
        if (error || !data.session) { setStatus('error'); return; }
        setSession(data.session);
        setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();

    return () => { alive = false; subscription.unsubscribe(); };
  }, [attempt, qc]);

  // Supabase RN guidance: refresh tokens only while the app is in the foreground
  useEffect(() => {
    supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => { sub.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);

  const userId = session?.user.id ?? null;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
  });

  const loadProfile = useCallback(
    () => qc.fetchQuery({ queryKey: ['profile', userId], queryFn: () => fetchProfile(userId as string), staleTime: 0 }),
    [qc, userId],
  );

  const value = useMemo<AuthValue>(() => ({
    status,
    session,
    userId,
    isAccount: !!session && !session.user.is_anonymous,
    profile: profileQuery.isPending ? undefined : (profileQuery.data ?? null),
    retry: () => setAttempt((a) => a + 1),
    loadProfile,
  }), [status, session, userId, profileQuery.isPending, profileQuery.data, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
