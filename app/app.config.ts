import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the static config; this adds the Android Google Maps key from the environment so it is never
// committed. iOS uses Apple Maps and needs no key. Without the key the Android map renders blank.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '' } },
  },
});
