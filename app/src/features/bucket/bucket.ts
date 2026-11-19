// P2-05 bucket list (TEC-155, decision N10). Figma 4145:30172 (file MkYNxuYFuktTR0yGExJnK7); see docs/figma-frames.md.
// sibling section in docs/figma-frames.md. Counts only: the server also returns who added an item, and nothing here shows it.
import { supabase } from '../../lib/supabase';

export type BucketItem = { experienceId: string; wantCount: number; mine: boolean };
export const bucketKey = (groupId: string) => ['bucket-list', groupId] as const;
export const wantsKey = (experienceId: string) => ['bucket-wants', experienceId] as const;

type ListRow = { experience_id: string; want_count: number | string; user_ids: string[] | null };
/** The group's list, most wanted first (the server orders it). `mine` says whether the viewer wants it too. */
export async function fetchBucketList(groupId: string, userId: string): Promise<BucketItem[]> {
  const { data, error } = await supabase.rpc('group_bucket_list', { group_id: groupId });
  if (error) throw error;
  return ((data ?? []) as ListRow[]).map(r => ({
    experienceId: r.experience_id, wantCount: Number(r.want_count), mine: (r.user_ids ?? []).includes(userId),
  }));
}

/** "4 want to do this", "1 wants to do this". */
export const wantLine = (count: number) => count === 1 ? '1 wants to do this' : `${count} want to do this`;

export type Wants = { mine: Set<string>; counts: Map<string, number> };
/** For one experience: the viewer's groups where they want it, and how many members want it in each group. */
export async function fetchWants(experienceId: string, userId: string): Promise<Wants> {
  const { data, error } = await supabase.from('bucket_items').select('group_id, user_id').eq('experience_id', experienceId);
  if (error) throw error;
  const wants: Wants = { mine: new Set(), counts: new Map() };
  for (const r of (data ?? []) as { group_id: string; user_id: string }[]) {
    wants.counts.set(r.group_id, (wants.counts.get(r.group_id) ?? 0) + 1);
    if (r.user_id === userId) wants.mine.add(r.group_id);
  }
  return wants;
}

/** Sets the viewer's own "want to do someday" in one group. Asking for the state it already has changes nothing. */
export async function setBucketItem(experienceId: string, groupId: string, wanted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_bucket_item', { experience_id: experienceId, group_id: groupId, wanted });
  if (error) throw error;
}

export const BUCKET_FAILED = 'Couldn’t update. Try again.';
export function bucketErrorMessage(error: unknown): string {
  const text = String((error as { message?: unknown } | null)?.message ?? '');
  if (text.includes('not_a_member')) return 'You’re no longer in this group.';
  if (text.includes('experience_not_found')) return 'This listing was removed.';
  return BUCKET_FAILED;
}
