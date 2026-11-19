// P1-05 "Fits everyone's budget" (TEC-147, decisions C5 and N5). Figma 4145:23408 (file MkYNxuYFuktTR0yGExJnK7); see docs/figma-frames.md.
// The server answers with experience ids to hide and never with an amount, and returns nothing when fewer than three people
// opted in. Nothing here shows, stores or logs a budget, a lowest budget or an average, and no server message is shown.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Experience } from '../discovery/useExperiences';

const MAX_IDS = 500; // the server refuses more than this in one call

export const hiddenKey = (groupId: string) => ['budget-hidden', groupId] as const;
export const optInKey = (userId: string) => ['budget-opt-in', userId] as const;

/** Ids to hide for this group, or null when the filter isn't available (the chip is then not drawn, with no explanation). */
export async function fetchHidden(groupId: string, ids: readonly string[]): Promise<string[] | null> {
  const hidden: string[] = [];
  for (let start = 0; start === 0 || start < ids.length; start += MAX_IDS) {
    const { data, error } = await supabase.rpc('group_budget_hidden', { group_id: groupId, experience_ids: ids.slice(start, start + MAX_IDS) });
    // The error text is dropped on purpose: nothing from the server's side of this check is shown.
    if (error) throw new Error('budget_check_failed');
    if (data === null) return null;
    hidden.push(...(data as string[]));
  }
  return hidden;
}

/** Re-asked for each group chosen. Cached for a minute, so switching chips back and forth is quiet. */
export function useBudgetHidden(groupId: string | undefined, catalog: readonly Experience[] | undefined) {
  const ids = catalog?.map(e => e.id) ?? [];
  return useQuery({ queryKey: [...hiddenKey(groupId ?? ''), ids.length], enabled: Boolean(groupId) && ids.length > 0, staleTime: 60_000, retry: false,
    queryFn: () => fetchHidden(groupId!, ids) });
}

/** Whether this person lets their own budget count toward group filters. Their own profile row; nobody else's is readable. */
export async function fetchOptIn(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('budget_opt_in').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as { budget_opt_in?: boolean } | null)?.budget_opt_in === true;
}
/** Asking for the state it already has changes nothing, so a retry is safe. */
export async function setOptIn(optIn: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_budget_opt_in', { opt_in: optIn });
  if (error) throw error;
}
export const OPT_IN_FAILED = 'Couldn’t update. Try again.';
