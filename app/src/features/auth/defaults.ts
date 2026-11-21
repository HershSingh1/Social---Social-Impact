// P0-17 profile defaults (TEC-98, decision C5): a usual budget per person and how the person usually gets around.
// Both are private: the server returns them only on the person's own profile row, and nothing here copies them into a
// plan, a group or the price filter. Never logged (rule 8).
import { supabase } from '../../lib/supabase';

export const TRANSPORT = [
  ['walk', 'Walk'], ['bike', 'Bike'], ['transit', 'Transit'], ['drive', 'Drive'], ['need_a_ride', 'Need a ride'],
] as const;
export type Transport = (typeof TRANSPORT)[number][0];
export const BUDGET_MAX = 1000;

export type Defaults = { budget: number | null; transport: Transport | null };
export const defaultsKey = (userId: string) => ['profile-defaults', userId] as const;

export const BUDGET_ERROR = 'Enter an amount from 0 to 1,000. Cents are fine, like 12.50.';
export const SAVE_FAILED = 'Couldn’t save. Check your connection. Your changes are still here.';

/** What the person typed as a number of dollars, or null for empty. `error` is set when it can't be used. People type "$12.50" and "1,000". */
export function parseBudget(text: string): { value: number | null; error?: string } {
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (cleaned === '') return { value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { value: null, error: BUDGET_ERROR };
  const value = Number(cleaned);
  return value >= 0 && value <= BUDGET_MAX ? { value } : { value: null, error: BUDGET_ERROR };
}

/** A saved budget as it goes back into the field: "35", or "12.50" when it has cents. */
export const budgetText = (value: number | null) => value === null ? '' : Number.isInteger(value) ? String(value) : value.toFixed(2);

export async function fetchDefaults(userId: string): Promise<Defaults> {
  const { data, error } = await supabase.from('profiles').select('budget_cap, transport').eq('id', userId).maybeSingle();
  if (error) throw error;
  const row = data as { budget_cap: number | string | null; transport: Transport | null } | null;
  return { budget: row?.budget_cap == null ? null : Number(row.budget_cap), transport: row?.transport ?? null };
}

/** The server replaces both values, so every save sends both. Saving the same values again changes nothing. */
export async function saveDefaults(next: Defaults): Promise<void> {
  const { error } = await supabase.rpc('set_profile_defaults', { budget_cap: next.budget, transport: next.transport });
  if (error) throw error;
}
