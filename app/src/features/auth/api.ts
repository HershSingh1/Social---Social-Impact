import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';

// Listed in supabase/config.toml `additional_redirect_urls`.
export const AUTH_REDIRECT = 'sidequest://auth/callback';
export const MAX_CODE_TRIES = 5;
export const NAME_MAX = 60;
export const CITY_MAX = 60;

/** Each sign-in method is one function, so Apple (P2, D10) can be added next to Google without touching the screens. */
export async function signInWithGoogle(): Promise<'signed-in' | 'cancelled'> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type !== 'success') return 'cancelled';
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('missing_code');
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw exchange.error;
  return 'signed-in';
}

export const isEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

/** Returns false for a wrong or expired code; throws for anything else (a dropped connection, say). */
export async function verifyEmailCode(email: string, token: string): Promise<boolean> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
  if (!error) return true;
  if (error.status === 401 || error.status === 403 || /expired|invalid/i.test(error.message)) return false;
  throw error;
}

export type ProfileInput = { name: string; city: string; age: string };
export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

export function validateProfile({ name, city, age }: ProfileInput): ProfileErrors {
  const errors: ProfileErrors = {};
  const cleanName = name.trim();
  if (!cleanName) errors.name = 'Enter your name.';
  else if (Array.from(cleanName).length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer.`;
  if (Array.from(city.trim()).length > CITY_MAX) errors.city = `Use ${CITY_MAX} characters or fewer.`;
  const cleanAge = age.trim();
  if (cleanAge && (!/^\d+$/.test(cleanAge) || Number(cleanAge) < 13 || Number(cleanAge) > 120)) {
    errors.age = 'Enter an age from 13 to 120.';
  }
  return errors;
}

export async function saveProfile({ name, city, age }: ProfileInput) {
  const { error } = await supabase.rpc('set_profile', {
    display_name: name.trim(), avatar_path: null, city: city.trim() || null, age: age.trim() ? Number(age.trim()) : null,
  });
  if (error) throw error;
}

/** True once `set_profile` has given this account a name. RLS only returns the caller's own row. */
export async function hasProfile(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return Boolean((data as { display_name: string | null } | null)?.display_name);
}
