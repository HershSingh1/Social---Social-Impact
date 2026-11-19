// Which groups may see this person's calendar answers. A row in calendar_shares is the opt-in; only its owner can read it.
import { supabase } from '../../lib/supabase';

export const sharesKey = ['calendar-shares'] as const;

export async function fetchShares(): Promise<Set<string>> {
  const { data, error } = await supabase.from('calendar_shares').select('group_id');
  if (error) throw error;
  return new Set(((data ?? []) as { group_id: string }[]).map(r => r.group_id));
}

/** Off deletes this person's calendar-sourced answers in the group on the server; manual answers stay. Safe to repeat. */
export async function setShare(groupId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_calendar_share', { group_id: groupId, enabled });
  if (error) throw error;
}
