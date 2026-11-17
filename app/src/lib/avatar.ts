import { supabase } from './supabase';

/** Turns the private database value into the public URL that image views need. */
export function avatarUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  try {
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  } catch {
    // A missing storage client in a test or an invalid value should fall back to the person's initial.
    return undefined;
  }
}
