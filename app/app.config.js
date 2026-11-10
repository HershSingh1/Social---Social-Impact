// Expo merges app.json into config before evaluating this file.
module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (process.env.EAS_BUILD_PROFILE === 'development') {
    const required = {
      EAS_PROJECT_ID: projectId,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      ...(process.env.EAS_BUILD_PLATFORM === 'android'
        ? { GOOGLE_MAPS_ANDROID_API_KEY: mapsKey } : {}),
    };
    for (const [name, value] of Object.entries(required)) {
      if (!value || /YOUR[-_]/i.test(value)) throw new Error(`Configure ${name} before building`);
    }
  }
  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins: [
      ...(config.plugins ?? []),
      'expo-dev-client',
      'expo-apple-authentication',
      ['react-native-maps', { androidGoogleMapsApiKey: mapsKey }],
    ],
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
  };
};
