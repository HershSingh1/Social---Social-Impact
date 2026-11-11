// Deliberately print names/errors only, never credential values.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
try {
  assert(url && !url.includes('YOUR-PROJECT'), 'Set EXPO_PUBLIC_SUPABASE_URL');
  assert(new URL(url).protocol === 'https:', 'Use the hosted dev project HTTPS URL');
  assert(key && key !== 'YOUR-ANON-KEY', 'Set EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!key.startsWith('sb_publishable_')) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()); }
    catch { throw new Error('Use a Supabase publishable key or legacy anon key'); }
    assert(payload.role === 'anon', 'Only the anon role is allowed in the mobile app');
  }
  console.log('Client environment is configured. Network and sign-in still need a device check.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
