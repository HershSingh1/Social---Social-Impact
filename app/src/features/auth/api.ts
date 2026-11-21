import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import { unregisterPhone } from '../notifications/register';

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

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export type ProfileInput = { name: string; username: string; city: string; age: string };
export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

/** People type "@Hershey" or "Hershey"; the server stores it without the @. */
export const cleanUsername = (raw: string) => raw.trim().replace(/^@/, '');

export function validateUsername(raw: string): string | undefined {
  const username = cleanUsername(raw);
  if (!username) return 'Choose a username.';
  if (!USERNAME_RE.test(username)) return 'Use 3 to 20 letters, numbers or underscores.';
}

export function validateProfile({ name, username, city, age }: ProfileInput): ProfileErrors {
  const errors: ProfileErrors = {};
  const cleanName = name.trim();
  if (!cleanName) errors.name = 'Enter your name.';
  else if (Array.from(cleanName).length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer.`;
  const usernameError = validateUsername(username);
  if (usernameError) errors.username = usernameError;
  if (Array.from(city.trim()).length > CITY_MAX) errors.city = `Use ${CITY_MAX} characters or fewer.`;
  const cleanAge = age.trim();
  if (cleanAge && (!/^\d+$/.test(cleanAge) || Number(cleanAge) < 13 || Number(cleanAge) > 120)) {
    errors.age = 'Enter an age from 13 to 120.';
  }
  return errors;
}

/** The two errors `set_profile` raises for the username, as text for under the field; null for anything else. */
export function usernameErrorFrom(error: unknown): string | null {
  const message = (error as { message?: string } | null)?.message;
  if (message === 'username_taken') return 'That username is taken. Try another.';
  if (message === 'invalid_username') return 'That username isn’t available. Try another.';
  return null;
}

type ProfileRow = { display_name: string; avatar_path: string | null; city: string | null; age: number | null; username?: string | null };
export type OwnProfile = { userId: string; name: string; avatarPath: string | null; city: string; age: string };

export async function saveProfile({ name, username, city, age }: ProfileInput, avatarPath: string | null = null) {
  const { error } = await supabase.rpc('set_profile', {
    display_name: name.trim(), avatar_path: avatarPath, city: city.trim() || null, age: age.trim() ? Number(age.trim()) : null,
    username: cleanUsername(username),
  });
  if (error) throw error;
}

/** For people who signed up before usernames: `set_profile` clears what it is not sent, so send the rest back as it is. */
export async function saveUsername(userId: string, username: string) {
  const { data, error } = await supabase.from('profiles').select('display_name, avatar_path, city, age').eq('id', userId).single();
  if (error) throw error;
  const row = data as ProfileRow;
  await saveProfile({ name: row.display_name, username, city: row.city ?? '', age: row.age === null ? '' : String(row.age) }, row.avatar_path);
}

export async function loadOwnProfile(): Promise<OwnProfile> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('not_authenticated');
  const { data, error } = await supabase.from('profiles').select('display_name, avatar_path, city, age')
    .eq('id', auth.user.id).single();
  if (error) throw error;
  const row = data as ProfileRow;
  return { userId: auth.user.id, name: row.display_name, avatarPath: row.avatar_path,
    city: row.city ?? '', age: row.age === null ? '' : String(row.age) };
}

/** Keeps the rest of the profile unchanged; a blank username tells the RPC to preserve it. */
export async function saveAvatarPath(profile: OwnProfile, avatarPath: string | null): Promise<void> {
  await saveProfile({ name: profile.name, username: '', city: profile.city, age: profile.age }, avatarPath);
}

export async function signOut() {
  await unregisterPhone(); // while still signed in; best effort, never blocks sign-out
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function deleteAccount() {
  const result = await supabase.rpc('delete_account');
  if (result.error) throw result.error;
  await signOut();
}
