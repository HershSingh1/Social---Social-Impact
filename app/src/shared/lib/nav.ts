import type { Href } from 'expo-router';

/** Cast a runtime path to Expo Router's Href (routes are plain strings here). */
export const href = (path: string) => path as Href;

/**
 * Only allow in-app paths as a "return to" target, so a crafted link cannot send someone elsewhere after sign-in.
 * Returns null for anything else.
 */
export function safeReturnTo(raw: string | string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || typeof v !== 'string') return null;
  if (!v.startsWith('/') || v.startsWith('//') || /^\/[a-z][a-z0-9+.-]*:/i.test(v) || v.includes('\\')) return null;
  return v;
}

/** Route to the sign-in sheet that comes back to `returnTo` afterwards ("sign in and return to the same step"). */
export function signInHref(returnTo: string): Href {
  const safe = safeReturnTo(returnTo) ?? '/';
  return `/sign-in?returnTo=${encodeURIComponent(safe)}` as Href;
}
