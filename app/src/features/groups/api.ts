import { supabase } from '../../lib/supabase';

export const GROUP_NAME_MAX = 50;

export type CreatedGroup = { groupId: string; code: string; expiresAt: string };
export type Member = { userId: string; name: string; avatarPath: string | null; isOwner: boolean };
export type Roster = { groupName: string; members: Member[] };

/** The server raises these as the message of a P0001 error (see `create_group`, TEC-27). */
export class GroupError extends Error {
  constructor(public readonly code: 'invalid_group_name' | 'group_limit_reached' | 'unknown') {
    super(code);
  }
}

export function validateGroupName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return 'Enter a group name.';
  if (Array.from(name).length > GROUP_NAME_MAX) return `Use ${GROUP_NAME_MAX} characters or fewer.`;
  return null;
}

/** Retrying with the same `clientKey` returns the same group and code, so a retry never duplicates (G13). */
export async function createGroup(clientKey: string, name: string): Promise<CreatedGroup> {
  const { data, error } = await supabase.rpc('create_group', { client_key: clientKey, name });
  if (error) {
    const known = (['invalid_group_name', 'group_limit_reached'] as const).find(code => error.message.includes(code));
    throw new GroupError(known ?? 'unknown');
  }
  const result = data as { group_id: string; code: string; expires_at: string };
  return { groupId: result.group_id, code: result.code, expiresAt: result.expires_at };
}

export const rosterKey = (groupId: string) => ['group-roster', groupId] as const;

type MemberRow = { user_id: string; role: 'owner' | 'member' };
type CardRow = { user_id: string; display_name: string; avatar_path: string | null };

/** Reads go through RLS; other people's name and photo only come from `get_profile_cards` (TEC-102). */
export async function fetchRoster(groupId: string): Promise<Roster> {
  const [group, rows] = await Promise.all([
    supabase.from('groups').select('name').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select('user_id, role').eq('group_id', groupId)
      .is('removed_at', null).eq('blocked', false).order('joined_at', { ascending: true }),
  ]);
  if (group.error) throw group.error;
  if (rows.error) throw rows.error;
  const memberRows = (rows.data ?? []) as MemberRow[];
  if (memberRows.length === 0) return { groupName: (group.data as { name: string } | null)?.name ?? '', members: [] };

  const cards = await supabase.rpc('get_profile_cards', { user_ids: memberRows.map(row => row.user_id) });
  if (cards.error) throw cards.error;
  const byId = new Map(((cards.data ?? []) as CardRow[]).map(card => [card.user_id, card]));
  return {
    groupName: (group.data as { name: string } | null)?.name ?? '',
    members: memberRows.map(row => ({
      userId: row.user_id,
      name: byId.get(row.user_id)?.display_name ?? 'Member',
      avatarPath: byId.get(row.user_id)?.avatar_path ?? null,
      isOwner: row.role === 'owner',
    })),
  };
}

/** "K7Q2MX" is shown as "K7Q 2MX" (Figma). Screen readers get it letter by letter. */
export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
export const spokenCode = (code: string) => code.split('').join(' ');
export const shareText = (groupName: string, code: string) => `Join ${groupName} on Sidequest with code ${code}`;
