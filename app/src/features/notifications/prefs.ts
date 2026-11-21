// One on/off per kind. A missing row means on (the server only stores what the person chose).
import { supabase } from '../../lib/supabase';
import { KINDS, type Kind } from './kinds';

export const prefsKey = ['notification-prefs'] as const;

export async function fetchPrefs(): Promise<Record<Kind, boolean>> {
  const { data, error } = await supabase.from('notification_prefs').select('kind, enabled');
  if (error) throw error;
  const prefs = Object.fromEntries(KINDS.map(k => [k.kind, true])) as Record<Kind, boolean>;
  for (const row of (data ?? []) as { kind: Kind; enabled: boolean }[]) if (row.kind in prefs) prefs[row.kind] = row.enabled;
  return prefs;
}

export async function setPref(kind: Kind, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_notification_pref', { kind, enabled });
  if (error) throw error;
}
