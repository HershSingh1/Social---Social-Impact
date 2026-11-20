// The only file that reads the phone's calendar. Permission is asked only from a button the person tapped (rule 6).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import type { BusyEvent } from './overlap';

export type Access = 'granted' | 'denied' | 'undetermined';
export type CalendarInfo = { id: string; title: string };

const toAccess = (r: { granted: boolean; status: string }): Access => r.granted ? 'granted' : r.status === 'denied' ? 'denied' : 'undetermined';
export const getAccess = async (): Promise<Access> => toAccess(await Calendar.getCalendarPermissions());
export const askAccess = async (): Promise<Access> => toAccess(await Calendar.requestCalendarPermissions());

/** The calendars' names and ids, for the person to choose from. Never uploaded. */
export async function listCalendars(): Promise<CalendarInfo[]> {
  return (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).map(c => ({ id: c.id, title: c.title }));
}

/** Events in the range, reduced to times and flags. Titles, places, people and notes are dropped here and never leave this function. */
export async function readEvents(calendarIds: string[], from: Date, to: Date): Promise<BusyEvent[]> {
  if (calendarIds.length === 0) return [];
  const events = await Calendar.listEvents(calendarIds, from, to);
  return events.map(e => ({
    start: new Date(e.startDate).getTime(), end: new Date(e.endDate).getTime(),
    free: e.availability === Calendar.Availability.FREE, canceled: e.status === Calendar.EventStatus.CANCELED,
  }));
}

// Which calendars count is chosen on the phone and never uploaded. null means all of them.
const countedKey = (userId: string) => `sidequest.calendar.counted.${userId}`;
export async function loadCounted(userId: string): Promise<string[] | null> {
  try { const raw = await AsyncStorage.getItem(countedKey(userId)); return raw ? JSON.parse(raw) as string[] : null; } catch { return null; }
}
export const saveCounted = (userId: string, ids: string[]) => AsyncStorage.setItem(countedKey(userId), JSON.stringify(ids));
