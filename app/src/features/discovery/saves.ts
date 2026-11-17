import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Saves (P0-07). A row is one person's save of one experience: `group_id` null is private to them, otherwise it
// belongs to that group's library. The client only reads (RLS returns the viewer's own personal rows plus the
// rows of every group they are in) and writes through `set_save`.
export type SaveRow = { experience_id: string; user_id: string; group_id: string | null };

/** Where the Map is looking: the whole catalog, the viewer's private saves, or one group's saved ideas. */
export type MapContext = { kind: 'explore' } | { kind: 'mine' } | { kind: 'group'; groupId: string };
export const EXPLORE: MapContext = { kind: 'explore' };

export const savesKey = ['saves'] as const;

export async function fetchSaves(): Promise<SaveRow[]> {
  const { data, error } = await supabase.from('saves').select('experience_id, user_id, group_id');
  if (error) throw error;
  return (data ?? []) as SaveRow[];
}

export function useSaves(userId: string | undefined) {
  return useQuery({ queryKey: [...savesKey, userId], enabled: Boolean(userId), queryFn: fetchSaves });
}

/** Sets the viewer's own save in one place. Sending the same request twice changes nothing, so a retry is safe. */
export async function setSave(experienceId: string, groupId: string | null, saved: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_save', { experience_id: experienceId, group_id: groupId, saved });
  if (error) throw error;
}

export const SAVE_FAILED = 'Couldn’t save that. Check your connection and try again.';

export function saveErrorMessage(error: unknown): string {
  const text = String((error as { message?: unknown } | null)?.message ?? '');
  if (text.includes('not_a_member')) return 'You’re no longer in this group.';
  if (text.includes('experience_not_found')) return 'This listing was removed.';
  return SAVE_FAILED;
}

export function isSaved(rows: readonly SaveRow[], userId: string, experienceId: string, groupId: string | null): boolean {
  return rows.some(r => r.user_id === userId && r.experience_id === experienceId && r.group_id === groupId);
}

/** True when the viewer saved this experience anywhere (for me or to a group). */
export function isSavedAnywhere(rows: readonly SaveRow[], userId: string, experienceId: string): boolean {
  return rows.some(r => r.user_id === userId && r.experience_id === experienceId);
}

/** The experience ids a Map chip shows, or null for Explore Austin (no limit). */
export function contextIds(rows: readonly SaveRow[], userId: string, context: MapContext): Set<string> | null {
  if (context.kind === 'explore') return null;
  const wanted = context.kind === 'mine'
    ? rows.filter(r => r.group_id === null && r.user_id === userId)
    : rows.filter(r => r.group_id === context.groupId);
  return new Set(wanted.map(r => r.experience_id));
}

export type GroupIdea = { experienceId: string; savers: string[] };

/** A group's library: each experience once, with everyone who saved it. Most-saved first. */
export function groupIdeas(rows: readonly SaveRow[], groupId: string): GroupIdea[] {
  const byExperience = new Map<string, string[]>();
  for (const r of rows) {
    if (r.group_id !== groupId) continue;
    const savers = byExperience.get(r.experience_id) ?? [];
    if (!savers.includes(r.user_id)) savers.push(r.user_id);
    byExperience.set(r.experience_id, savers);
  }
  return [...byExperience].map(([experienceId, savers]) => ({ experienceId, savers }))
    .sort((a, b) => b.savers.length - a.savers.length);
}

/** "Saved by you and Maya". The viewer comes first and is written as "you". */
export function savedByLine(savers: readonly string[], viewerId: string, nameOf: (userId: string) => string): string {
  const people = [...savers.filter(s => s === viewerId).map(() => 'you'), ...savers.filter(s => s !== viewerId).map(nameOf)];
  if (people.length <= 1) return `Saved by ${people[0] ?? 'someone'}`;
  return `Saved by ${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`;
}
