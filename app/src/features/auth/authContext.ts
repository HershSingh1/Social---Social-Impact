import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';
import type { OnboardingState } from './onboarding';

/** `loading` until the stored session is read; `error` if the profile check failed (the gate offers Try again). */
export type AuthStatus = 'loading' | 'signed-out' | 'needs-profile' | 'ready' | 'error';
/** `needs-profile` lasts through all three onboarding steps; `onboarding.step` says which one to show. */
export type AuthState = { status: AuthStatus; session: Session | null; onboarding: OnboardingState; refresh: () => Promise<void> };

// Kept apart from AuthProvider so a shared screen can read the session without loading the provider's storage code.
export const AuthContext = createContext<AuthState | null>(null);

/** Like `useAuth`, but null outside the provider, for shared screens that only improve when someone is signed in. */
export function useOptionalAuth() {
  return useContext(AuthContext);
}

