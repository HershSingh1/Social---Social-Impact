import { supabase } from '@/shared/lib/supabase';
import type {
  CreateGroupResult, GroupRow, JoinCodeRow, JoinResult, MemberRow, PreviewResult,
} from '@/types/database';

// ---------------------------------------------------------------- reads (RLS decides what each person sees)
export type GroupSummary = {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  memberNames: string[]; // first four, for the avatar stack
};

type GroupWithMembers = GroupRow & {
  group_members: { user_id: string; joined_at: string; profiles: { display_name: string } | null }[];
};

export async function fetchMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, owner_id, group_members(user_id, joined_at, profiles(display_name))')
    .is('group_members.removed_at', null)
    .order('name');
  if (error) throw error;
  return (data as unknown as GroupWithMembers[]).map((g) => {
    const members = [...g.group_members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    return {
      id: g.id,
      name: g.name,
      ownerId: g.owner_id,
      memberCount: members.length,
      memberNames: members.slice(0, 4).map((m) => m.profiles?.display_name ?? '?'),
    };
  });
}

/** null = the group is not visible to this person (removed, or it never existed). */
export async function fetchGroup(groupId: string): Promise<GroupRow | null> {
  const { data, error } = await supabase.from('groups').select('id, name, owner_id').eq('id', groupId).maybeSingle();
  if (error) throw error;
  return data as GroupRow | null;
}

export async function fetchMembers(groupId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at, profiles(display_name, is_guest, avatar_path)')
    .eq('group_id', groupId)
    .is('removed_at', null)
    .order('joined_at');
  if (error) throw error;
  return data as unknown as MemberRow[];
}

export async function fetchJoinCode(groupId: string): Promise<JoinCodeRow | null> {
  const { data, error } = await supabase
    .from('join_codes').select('code, expires_at').eq('group_id', groupId).is('revoked_at', null).maybeSingle();
  if (error) throw error;
  return data as JoinCodeRow | null;
}

// ---------------------------------------------------------------- writes (RPC only)
export async function createGroup(name: string): Promise<CreateGroupResult> {
  const { data, error } = await supabase.rpc('create_group', { p_name: name });
  if (error) throw error;
  return data as CreateGroupResult;
}

/** Returns {ok:false, error} for wrong / expired / too-many-tries; throws for network and auth problems. */
export async function previewCode(code: string): Promise<PreviewResult> {
  const { data, error } = await supabase.rpc('preview_group_code', { p_code: code });
  if (error) throw error;
  return data as PreviewResult;
}

export async function joinGroup(code: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_group', { p_code: code });
  if (error) throw error;
  return data as JoinResult;
}
