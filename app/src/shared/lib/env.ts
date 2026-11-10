// EXPO_PUBLIC_* must be read as literal property accesses so Expo can inline them at build time.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};
export const isBackendConfigured = env.supabaseUrl !== '' && env.supabaseAnonKey !== '';
