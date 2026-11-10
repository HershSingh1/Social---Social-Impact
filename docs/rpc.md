# RPC contract (M1)

Clients call these with `supabase.rpc(name, args)`. They are the only way to write data. Every function is
`SECURITY DEFINER`, checks the caller with `auth.uid()`, and is executable only by signed-in users (guests included;
Supabase anonymous auth uses role `authenticated`). "Account" = signed in with Apple / email code (JWT claim
`is_anonymous` is false).

**Errors.** A failing call raises an exception whose `message` is a machine code from the tables below
(`error.message === 'voting_closed'`); the UI maps codes to the spec's copy. `create_pick` puts the blocking pick's id in
`error.details` for `open_pick_exists`. Join-code functions are the exception: they *return* `{ok:false, error}` so the
failed-attempt row used by the rate limiter is not rolled back.

Common codes on every function: `not_authenticated`, `account_required` (guest tried an account-only action),
`not_member`, `not_organizer`.

| Function | Args | Returns | Who | Specific error codes |
| --- | --- | --- | --- | --- |
| `set_profile` | `p_display_name text, p_avatar_path text = null` | void | any signed-in | `invalid_display_name` (1-60 after trim) |
| `create_group` | `p_name text` | `{group_id, code, expires_at}` | account | `profile_required`, `invalid_name` (1-50), `too_many_groups` (20) |
| `preview_group_code` | `p_code text` | `{ok, group_id, group_name, owner_name, already_member}` or `{ok:false,error}` | any signed-in | returns `wrong_code`, `expired`, `too_many_tries` |
| `join_group` | `p_code text` | `{ok:true, status: joined\|already_member, group_id, group_name}` or `{ok:false,error}` | any signed-in | raises `profile_required`; returns `wrong_code`, `expired` (also revoked), `too_many_tries`, `blocked`, `group_full` (30), `too_many_groups` (20) |
| `create_pick` | `p_group_id uuid, p_options jsonb, p_deadline timestamptz, p_starred int = null` | pick id | account member | `invalid_options`, `invalid_option_count` (2-5), `invalid_star` (1-based position), `invalid_deadline` (1 h to 7 d, +-1 min slack), `experience_unavailable`, `open_pick_exists` |
| `add_option` | `p_pick_id uuid, p_experience_id uuid, p_proposed_start timestamptz = null` | option id | pick organizer | `pick_not_found`, `voting_closed`, `too_many_options`, `experience_unavailable` |
| `cast_vote` | `p_option_id uuid, p_value text` (`yes`/`maybe`/`no`, `null` clears) | void | any member (guests too) | `invalid_value`, `option_not_found`, `voting_closed` |
| `close_pick` | `p_pick_id uuid` | `{state, winner_option_id, tie_rule}` | pick organizer | `pick_not_found`, `pick_not_open` (planned/cancelled). Idempotent on closed |
| `cancel_pick` | `p_pick_id uuid` | void | pick organizer | `pick_not_cancellable` |
| `override_pick` | `p_pick_id uuid, p_option_id uuid` (`null` clears) | void | pick organizer | `pick_not_closed`, `option_not_found` |
| `send_plan` | `p_client_key uuid, p_group_id uuid, p_experience_id uuid, p_start_local timestamp, p_end_local timestamp, p_meeting_point text, p_note text = null, p_recipients uuid[] = null, p_pick_id uuid = null, p_time_zone text = 'America/Chicago'` | plan id | account member | `client_key_required`, `client_key_conflict`, `fixed_sessions_not_supported`, `start_in_past`, `end_before_start`, `nonexistent_local_time`, `invalid_time_zone`, `invalid_meeting_point` (1-200), `invalid_note` (500), `recipient_not_member`, `pick_not_found`, `pick_not_closed`, `pick_already_planned`, `pick_has_no_choice`, `experience_mismatch` |
| `respond` | `p_plan_id uuid, p_revision int, p_status text` (`going`/`cant_go`) | `{going, awaiting, cant_go, needs_reconfirm, revision}` | invitee | `plan_not_found`, `plan_cancelled`, `stale_revision`, `answers_locked`, `invalid_status`, `organizer_cannot_decline` |
| `edit_plan` | `p_plan_id uuid, p_changes jsonb` keys: `start_local`, `end_local` (`YYYY-MM-DDTHH:MI:SS` wall-clock), `meeting_point`, `note` | `{material, changed, revision, needs_reconfirm}` | plan organizer | `unknown_field`, `invalid_changes`, `plan_cancelled`, `plan_not_sent`, `plan_started`, `start_in_past`, `end_before_start`, `nonexistent_local_time`, `invalid_meeting_point`, `invalid_note` |
| `close_due_picks` | none | count closed | pg_cron only (clients denied) | |

## Behaviors worth knowing
- **Idempotency.** `send_plan`: same `p_client_key` returns the same plan id (retry-safe; generate the key when the draft
  is created, reuse it for Retry). `create_pick`: repeating the caller's own open pick with identical options returns it.
  `cast_vote` and `respond` are idempotent upserts.
- **Time.** Send wall-clock local time and the zone; the server stores UTC and rejects nonexistent DST times.
- **Material edit** (start, end, meeting point): new revision; every Going invitee except the organizer becomes
  `needs_reconfirm`. **Minor edit** (note only): same revision. Old revisions stay in `plan_revisions` for the
  old-vs-new banner.
- **Votes.** `votes` is readable only by its owner. Everyone in the group reads `option_tallies` (yes/maybe/no per option)
  and `pick_voter_status` (`complete` = voted on every option). Realtime: subscribe to those, not to `votes`.
- **Result order** (client): sort options by `yes*2+maybe` desc, `no` asc, starred first, `position` asc. The winner and the
  sentence come from `picks.winner_option_id` / `picks.tie_rule`.
- **Realtime tables:** `group_members`, `picks`, `pick_options`, `option_tallies`, `pick_voter_status`, `plans`,
  `plan_revisions`, `rsvps`.
- **Reads** are plain `supabase.from(table).select()`; RLS decides what each user sees.
