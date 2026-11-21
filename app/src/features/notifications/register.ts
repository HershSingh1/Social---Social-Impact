// Tells the server which phone to use. Both calls are safe to repeat (register moves the token to whoever is signed in).
import { supabase } from '../../lib/supabase';
import { clearStoredToken, getPushToken, loadStoredToken, platform, storeToken } from './device';

/** Registers this phone for the signed-in person. Never throws: a failure here must not break the screen it ran from. */
export async function registerPhone(): Promise<boolean> {
  try {
    const token = await getPushToken();
    const { error } = await supabase.rpc('register_push_token', { token, platform: platform() });
    if (error) return false;
    await storeToken(token);
    return true;
  } catch { return false; }
}

/** Removes this phone from the signed-in person's tokens. Best effort, so sign-out never gets stuck on it. */
export async function unregisterPhone(): Promise<void> {
  try {
    const token = await loadStoredToken();
    if (!token) return;
    const { error } = await supabase.rpc('remove_push_token', { token });
    if (!error) await clearStoredToken();
  } catch { /* the next person to sign in on this phone takes the token over */ }
}
