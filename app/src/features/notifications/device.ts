// The only file that talks to the phone's notification system. Permission is asked only from a button the person
// tapped (rule 6). The push token is private: it is never logged, shown or put in an error message (rule 8).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type Access = 'granted' | 'denied' | 'undetermined';

const toAccess = (r: { granted: boolean; canAskAgain: boolean; status: string }): Access =>
  r.granted ? 'granted' : r.status === 'denied' && !r.canAskAgain ? 'denied' : 'undetermined';

export const getAccess = async (): Promise<Access> => toAccess(await Notifications.getPermissionsAsync());
export const askAccess = async (): Promise<Access> => toAccess(await Notifications.requestPermissionsAsync());

/** The Expo push token for this phone. Needs a development or release build and the EAS project id. */
export async function getPushToken(): Promise<string> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

export const platform = (): 'ios' | 'android' => Platform.OS === 'android' ? 'android' : 'ios';

// The token is kept on the phone only so sign-out can remove it from the server without asking Expo again.
const tokenKey = 'sidequest.notifications.token';
export const loadStoredToken = async (): Promise<string | null> => { try { return await AsyncStorage.getItem(tokenKey); } catch { return null; } };
export const storeToken = (token: string) => AsyncStorage.setItem(tokenKey, token);
export const clearStoredToken = async () => { try { await AsyncStorage.removeItem(tokenKey); } catch { /* best effort */ } };

// Whether the "Get a heads-up?" ask was already shown to this person. It is shown once (after the first join or send).
const offeredKey = (userId: string) => `sidequest.notifications.offered.${userId}`;
export const wasOffered = async (userId: string): Promise<boolean> => { try { return (await AsyncStorage.getItem(offeredKey(userId))) === '1'; } catch { return false; } };
export const markOffered = async (userId: string) => { try { await AsyncStorage.setItem(offeredKey(userId), '1'); } catch { /* shown again next time */ } };
