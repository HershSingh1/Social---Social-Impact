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

// ---------------------------------------------------------------- catalog (P0-04..06)
export type Category = 'art_walks' | 'make' | 'outdoors' | 'food_drink' | 'games_trivia' | 'music_film' | 'active';
export type PriceKind = 'exact' | 'estimated' | 'free' | 'unknown';
export type TimingKind = 'fixed' | 'flexible' | 'unknown';

export type Experience = {
  id: string;
  name: string;
  category: Category;
  description: string;
  lat: number;
  lng: number;
  area: string;
  price_kind: PriceKind;
  price_min: number | null;
  price_max: number | null;
  timing_kind: TimingKind;
  /** fixed-time experiences: [{label: "Sat 10:00 AM"}, ...] */
  sessions: { label: string }[] | null;
  hours_text: string | null;
  duration_min: number | null;
  meeting_point: string;
  booking_required: boolean;
  booking_url: string | null;
  source: string;
  checked_on: string; // YYYY-MM-DD
  status: 'active' | 'removed';
  version: number;
};
