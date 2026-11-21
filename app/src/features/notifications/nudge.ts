// The organizer's Nudge (P1-04, N4). The server nudges each person at most once per 24 hours and returns who it
// actually nudged; anyone left out is shown in words. The time of a nudge is kept on this phone only, so the message
// can say when the next one is allowed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatClock } from '../../lib/time';
import { supabase } from '../../lib/supabase';

export const NUDGE_WINDOW_MS = 24 * 3_600_000;
const key = (planId: string) => `sidequest.nudged.${planId}`;

export async function loadNudges(planId: string): Promise<Record<string, string>> {
  try { const raw = await AsyncStorage.getItem(key(planId)); return raw ? JSON.parse(raw) as Record<string, string> : {}; } catch { return {}; }
}

async function remember(planId: string, userIds: string[], at: string) {
  try { await AsyncStorage.setItem(key(planId), JSON.stringify({ ...(await loadNudges(planId)), ...Object.fromEntries(userIds.map(id => [id, at])) })); }
  catch { /* the server still enforces the 24 hours */ }
}

/** Returns the people who were nudged. People left out were nudged in the last 24 hours, are no longer awaiting, or turned nudges off. */
export async function nudgePeople(planId: string, userIds: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc('nudge', { plan_id: planId, user_ids: userIds });
  if (error) throw error;
  const nudged = Array.isArray(data) ? data as string[] : [];
  if (nudged.length) await remember(planId, nudged, new Date().toISOString());
  return nudged;
}

export const isRecent = (at: string | undefined, now: number) => at !== undefined && now - Date.parse(at) < NUDGE_WINDOW_MS;

/** "You can nudge again tomorrow after 3:40 PM." in Austin time (rule 4). Without a remembered time, the rule in words. */
export function refusedMessage(name: string, at: string | undefined, now = Date.now()): string {
  if (isRecent(at, now)) return `You already nudged ${name} in the last 24 hours. You can nudge again after ${formatClock(new Date(Date.parse(at!) + NUDGE_WINDOW_MS).toISOString())} tomorrow.`;
  return `${name} wasn’t nudged. You can nudge each person once every 24 hours, and they may have turned nudges off.`;
}
