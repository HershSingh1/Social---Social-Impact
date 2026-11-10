import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { signInHref } from '@/shared/lib/nav';
import { useAuth } from './AuthProvider';

/**
 * "Ask to sign in at the moment of use, then come back to the same step" (spec P0-02).
 *   const requireAccount = useRequireAccount();
 *   requireAccount('/create-group', () => router.push('/create-group'));
 * Accounts run the action immediately; guests are sent to the sign-in sheet, which returns to `returnTo`.
 */
export function useRequireAccount() {
  const { isAccount } = useAuth();
  const router = useRouter();
  return useCallback(
    (returnTo: string, action: () => void) => {
      if (isAccount) action();
      else router.push(signInHref(returnTo));
    },
    [isAccount, router],
  );
}
