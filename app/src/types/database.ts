// Hand-written row shapes for what the app reads (replace with `npm run db:types` output once generated on a
// machine with Docker). Writes are RPC-only; see docs/rpc.md.
export type Profile = { id: string; display_name: string; is_guest: boolean; avatar_path: string | null };

export type GroupRow = { id: string; name: string; owner_id: string };

export type MemberProfile = { display_name: string; is_guest: boolean; avatar_path: string | null };
export type MemberRow = {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profiles: MemberProfile | null;
};

export type JoinCodeRow = { code: string; expires_at: string };

export type CreateGroupResult = { group_id: string; code: string; expires_at: string };
export type CodeFailure = { ok: false; error: string };
export type PreviewResult =
  | { ok: true; group_id: string; group_name: string; owner_name: string; already_member: boolean }
  | CodeFailure;
export type JoinResult =
  | { ok: true; status: 'joined' | 'already_member'; group_id: string; group_name: string }
  | CodeFailure;
