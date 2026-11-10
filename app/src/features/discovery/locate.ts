import * as Location from 'expo-location';

/** The map opens here, and stays here if location is denied (spec P0-04). */
export const DOWNTOWN_AUSTIN = { latitude: 30.2672, longitude: -97.7431 };
export const DEFAULT_REGION = { ...DOWNTOWN_AUSTIN, latitudeDelta: 0.14, longitudeDelta: 0.14 };

export type LocateResult =
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied' }
  | { status: 'error' };

/**
 * Asked for ONLY when the person taps the locate button (never at launch). Denied or failing is a normal
 * outcome: the caller keeps the downtown view and everything else keeps working.
 */
export async function locateOnce(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { status: 'denied' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { status: 'granted', latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return { status: 'error' };
  }
}
