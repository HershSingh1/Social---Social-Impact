import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Clients never write tables directly: every write is supabase.rpc(...). Reads go through RLS.
// Placeholders keep the import from throwing when .env is missing; the root layout shows a setup screen instead.
export const supabase = createClient(env.supabaseUrl || 'http://127.0.0.1:54321', env.supabaseAnonKey || 'missing-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
