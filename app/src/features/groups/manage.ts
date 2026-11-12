import { supabase } from '../../lib/supabase';

// Owner controls and leaving (P0-03, TEC-81 RPCs). The server checks every permission; the app only
// hides the owner's controls from members.

export type RemovedMember = { userId: string; name: string; removedAt: string };

const MESSAGES: Record<string, string> = {
  not_owner: 'Only the group’s owner can do that.',
  not_a_member: 'You’re no longer in this group.',
  group_not_found: 'This group no longer exists.',
  member_not_found: 'That person is no longer in the group.',
  member_not_removed: 'That person can already join again.',
  cannot_remove_owner: 'The owner can’t be removed.',
  already_owner: 'You’re already the owner.',
  owner_must_transfer: 'Make someone else the owner before you leave.',
  code_generation_failed: 'Couldn’t make a new code. Try again.',
};

/** The server raises a known code as the error message (P0001 / 42501); anything else is a generic retry. */
export class ManageError extends Error {}

export function manageMessage(error: unknown): string {
  return error instanceof ManageError ? error.message : 'Couldn’t finish. Try again.';
}

async function call(fn: string, args: Record<string, string>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = Object.keys(MESSAGES).find(key => error.message.includes(key));
    throw code ? new ManageError(MESSAGES[code]) : error;
  }
  return data as unknown;
}

export const revokeCode = (groupId: string) => call('revoke_code', { group_id: groupId });
export async function regenerateCode(groupId: string): Promise<{ code: string; expiresAt: string }> {
  const result = await call('regenerate_code', { group_id: groupId }) as { code: string; expires_at: string };
  return { code: result.code, expiresAt: result.expires_at };
}
export const removeMember = (groupId: string, userId: string) => call('remove_member', { group_id: groupId, user_id: userId });
export const allowBack = (groupId: string, userId: string) => call('allow_back', { group_id: groupId, user_id: userId });
export const transferOwner = (groupId: string, userId: string) => call('transfer_owner', { group_id: groupId, user_id: userId });
export const leaveGroup = (groupId: string) => call('leave_group', { group_id: groupId });

export const removedKey = (groupId: string) => ['group-removed', groupId] as const;

/** People the owner removed who can't rejoin yet. `get_profile_cards` only returns people who are still in
 * a shared group, so a removed person's name comes from `knownNames` (seen earlier) or a plan you share. */
export async function fetchRemoved(groupId: string, knownNames: ReadonlyMap<string, string>): Promise<RemovedMember[]> {
  const { data, error } = await supabase.from('group_members').select('user_id, removed_at')
    .eq('group_id', groupId).eq('blocked', true).order('removed_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string; removed_at: string }[];
  if (rows.length === 0) return [];
  const cards = await supabase.rpc('get_profile_cards', { user_ids: rows.map(row => row.user_id) });
  const byId = new Map(((cards.data ?? []) as { user_id: string; display_name: string }[]).map(c => [c.user_id, c.display_name]));
  return rows.map(row => ({
    userId: row.user_id,
    name: byId.get(row.user_id) ?? knownNames.get(row.user_id) ?? 'Removed member',
    removedAt: row.removed_at,
  }));
}
