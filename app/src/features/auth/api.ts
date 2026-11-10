import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/shared/lib/supabase';
import type { Profile } from '@/types/database';

// ------------------------------------------------------------------ profile
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles').select('id, display_name, is_guest, avatar_path').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Guests call this before joining a group; accounts after sign-in. Creates or updates the profile. */
export async function setProfile(displayName: string): Promise<void> {
  const { error } = await supabase.rpc('set_profile', { p_display_name: displayName });
  if (error) throw error;
}

/** Does this guest have anything to lose by switching to another account? (any active group membership) */
export async function guestHasActivity(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('group_members').select('group_id', { count: 'exact', head: true })
    .eq('user_id', userId).is('removed_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function currentUserIsAnonymous(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user.is_anonymous;
}

// ------------------------------------------------------------------ Sign in with Apple
export type AppleResult =
  | { status: 'done'; fullName: string | null }
  /** This Apple ID already belongs to another account: ask before switching. */
  | { status: 'exists'; token: string; nonce: string; fullName: string | null }
  | { status: 'cancelled' };

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try { return await AppleAuthentication.isAvailableAsync(); } catch { return false; }
}

function joinName(n: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  const v = [n?.givenName, n?.familyName].filter(Boolean).join(' ').trim();
  return v.length > 0 ? v : null;
}

const isIdentityTaken = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'identity_already_exists' || /already (been )?linked|already exists/i.test(e.message ?? ''));

/**
 * A guest who signs in keeps the same user id: the Apple identity is LINKED to the anonymous user
 * (supabase.auth.linkIdentity with the native id token), so memberships, votes and RSVPs stay.
 * Apple gets the SHA-256 of the nonce; Supabase gets the raw nonce.
 */
export async function signInWithApple(): Promise<AppleResult> {
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    throw e;
  }
  if (!credential.identityToken) throw new Error('apple_no_token');
  const fullName = joinName(credential.fullName);
  const token = credential.identityToken;

  if (await currentUserIsAnonymous()) {
    const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token, nonce });
    if (!error) return { status: 'done', fullName };
    if (isIdentityTaken(error)) return { status: 'exists', token, nonce, fullName };
    throw error;
  }
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce });
  if (error) throw error;
  return { status: 'done', fullName };
}

/** The person confirmed: leave the guest session and sign in to the account that owns this Apple ID. */
export async function switchToExistingApple(token: string, nonce: string): Promise<void> {
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce });
  if (error) throw error;
}

// ------------------------------------------------------------------ email one-time code
export type EmailStart = { mode: 'upgrade' } | { mode: 'exists' };

const isEmailTaken = (e: { code?: string; message?: string }) =>
  e.code === 'email_exists' || /already (been )?registered|already exists/i.test(e.message ?? '');

/** Guest -> account: attach the email to the guest user (same user id) and email a 6-digit code. */
export async function startEmailUpgrade(email: string): Promise<EmailStart> {
  const { error } = await supabase.auth.updateUser({ email });
  if (!error) return { mode: 'upgrade' };
  if (isEmailTaken(error)) return { mode: 'exists' };
  throw error;
}

/** The email already has an account and the person agreed to switch: email a code for that account. */
export async function sendExistingAccountCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string, mode: EmailStart['mode']): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: mode === 'upgrade' ? 'email_change' : 'email' });
  if (error) throw error;
}
