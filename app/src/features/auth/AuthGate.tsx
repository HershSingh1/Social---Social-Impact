import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { ErrorState, Loading, Screen } from '../../ui';
import { savePendingLink, takePendingLink, useAuth, type AuthStatus } from './AuthProvider';

const AUTH_ROUTES = new Set(['welcome', 'sign-in', 'profile-setup', 'auth']);

/** Turns `sidequest://join?code=K7Q2MX` into `/join?code=K7Q2MX`; null for the auth screens and the home link. */
export function linkToPath(url: string): string | null {
  const { path, queryParams } = Linking.parse(url);
  const clean = (path ?? '').replace(/^\/+|\/+$/g, '');
  if (!clean || AUTH_ROUTES.has(clean.split('/')[0])) return null;
  const query = new URLSearchParams(
    Object.entries(queryParams ?? {}).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []),
  ).toString();
  return `/${clean}${query ? `?${query}` : ''}`;
}

type Props = { children: (status: Exclude<AuthStatus, 'loading' | 'error'>) => ReactNode };

export function AuthGate({ children }: Props) {
  const { status, refresh } = useAuth();
  const url = Linking.useLinkingURL();

  // A link opened before sign-in is kept and opened once the profile is set up (D1).
  useEffect(() => {
    if (!url || status === 'ready' || status === 'loading') return;
    const path = linkToPath(url);
    if (path) void savePendingLink(path);
  }, [url, status]);

  // On the step into `ready` the guards have already moved off the auth screens; open the kept link, if any.
  const previous = useRef(status);
  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (status !== 'ready' || was === 'ready' || was === 'loading') return;
    void takePendingLink().then(path => { if (path) router.push(path as never); });
  }, [status]);

  if (status === 'loading') return <Loading label="Loading your account…" />;
  if (status === 'error') {
    return <Screen><ErrorState message="Couldn’t load your account. Check your connection and try again." onRetry={refresh} /></Screen>;
  }
  return children(status);
}
