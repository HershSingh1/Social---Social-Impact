// Add to calendar (P1-03). The only file that writes a plan into the phone's calendar.
// Permission is asked only from a button the person tapped (rule 6). The event id stays on the phone (spec P1-03):
// nothing here talks to the server, and adding never sets an RSVP.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { PLAN_TIME_ZONE } from '../../lib/time';
import type { Plan } from '../plans/plan';

export type Access = 'granted' | 'denied';
export type CalendarChoice = { id: string; title: string };
/** What this phone remembers about the copy it made: where it lives and what it was last told. */
export type SavedEvent = { eventId: string; calendarId: string; calendarTitle: string;
  startAt: string; endAt: string; meetingPoint: string; cancelled: boolean };
type PlanForCalendar = Pick<Plan, 'id' | 'name' | 'state' | 'current'>;
/** What the notice says is out of date: a cancelled plan, the time, or only the meeting point. */
export type StaleKind = 'cancelled' | 'time' | 'place';

/** Asked when the person taps. Already answered means no second prompt, only the current answer. */
export async function askAccess(): Promise<Access> {
  return (await Calendar.requestCalendarPermissions()).granted ? 'granted' : 'denied';
}

/** Only calendars the phone lets us write to; read-only ones (holidays, subscribed) would fail. */
export async function writableCalendars(): Promise<CalendarChoice[]> {
  const all = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return all.filter(c => c.allowsModifications).map(c => ({ id: c.id, title: c.title }));
}

/** The event written for a plan. A cancelled plan is kept in the calendar, retitled, rather than removed. */
export function planEvent(plan: PlanForCalendar) {
  const rev = plan.current;
  return {
    title: plan.state === 'cancelled' ? `Cancelled: ${plan.name}` : plan.name,
    startDate: new Date(rev.startAt), endDate: new Date(rev.endAt), timeZone: PLAN_TIME_ZONE,
    location: rev.meetingPoint, url: `sidequest://plan/${plan.id}`,
    notes: 'Added from Sidequest. This is a one-time copy. Open the plan for its latest details.',
  };
}

/** What the saved copy no longer matches, or null when it is current. A price or booking change alone is not a calendar change. */
export function staleKind(saved: SavedEvent | null, plan: PlanForCalendar): StaleKind | null {
  if (!saved) return null;
  if (plan.state === 'cancelled') return saved.cancelled ? null : 'cancelled';
  const rev = plan.current;
  if (Date.parse(saved.startAt) !== Date.parse(rev.startAt) || Date.parse(saved.endAt) !== Date.parse(rev.endAt)) return 'time';
  return saved.meetingPoint !== rev.meetingPoint ? 'place' : null;
}

const savedKey = (userId: string, planId: string) => `sidequest.calendarEvent.${userId}.${planId}`;
export async function loadSaved(userId: string, planId: string): Promise<SavedEvent | null> {
  try { return JSON.parse((await AsyncStorage.getItem(savedKey(userId, planId))) ?? 'null') as SavedEvent | null; } catch { return null; }
}
const save = (userId: string, planId: string, value: SavedEvent) => AsyncStorage.setItem(savedKey(userId, planId), JSON.stringify(value));
export const clearSaved = (userId: string, planId: string) => AsyncStorage.removeItem(savedKey(userId, planId)).catch(() => undefined);

const remember = (eventId: string, calendar: CalendarChoice, plan: PlanForCalendar): SavedEvent => ({
  eventId, calendarId: calendar.id, calendarTitle: calendar.title, startAt: plan.current.startAt, endAt: plan.current.endAt,
  meetingPoint: plan.current.meetingPoint, cancelled: plan.state === 'cancelled',
});

async function createIn(calendar: CalendarChoice, plan: PlanForCalendar): Promise<SavedEvent> {
  const event = await (await Calendar.ExpoCalendar.get(calendar.id)).createEvent(planEvent(plan));
  return remember(event.id, calendar, plan);
}

/** Writes the plan to the chosen calendar and remembers its event id on this phone. */
export async function addToCalendar(userId: string, plan: PlanForCalendar, calendar: CalendarChoice): Promise<SavedEvent> {
  const saved = await createIn(calendar, plan);
  await save(userId, plan.id, saved);
  return saved;
}

export class CalendarDenied extends Error { constructor() { super('calendar_denied'); } }
/** The calendar the copy was in is gone, so the person has to pick one again. */
export class CalendarGone extends Error { constructor() { super('calendar_gone'); } }

/**
 * Moves the existing event to the plan's current details, never a second one. If the person deleted the event in
 * Calendar, a new one is added to the same calendar and the result says so.
 */
export async function updateInCalendar(userId: string, plan: PlanForCalendar, saved: SavedEvent): Promise<{ saved: SavedEvent; replaced: boolean }> {
  if ((await askAccess()) !== 'granted') throw new CalendarDenied();
  const calendar = { id: saved.calendarId, title: saved.calendarTitle };
  let event: Calendar.ExpoCalendarEvent | null = null;
  try { event = await Calendar.ExpoCalendarEvent.get(saved.eventId); } catch { event = null; }
  if (event) {
    await event.update(planEvent(plan));
    const next = remember(saved.eventId, calendar, plan);
    await save(userId, plan.id, next);
    return { saved: next, replaced: false };
  }
  let next: SavedEvent;
  try { next = await createIn(calendar, plan); } catch { throw new CalendarGone(); }
  await save(userId, plan.id, next);
  return { saved: next, replaced: true };
}
