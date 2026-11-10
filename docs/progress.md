# Progress

Scope: Nov 22 demo subset only. Status per requirement ID. Deferred = "Before the pilot" column of the spec.

| Milestone | Status |
| --- | --- |
| M0 Plan and scaffold | Done (see `docs/m0-plan.md`) |
| M1 Database | Done, awaiting review (see below) |
| M2 Accounts and groups (D1, D2) | Not started |
| M3 Discovery (D3) | Not started |
| M4 Group pick (D3-D5) | Not started |
| M5 Plans (D6-D8) | Not started |
| M6 Hubs and polish | Not started |

| Req | Demo scope | Status | Deferred to pilot |
| --- | --- | --- | --- |
| P0-01 | Join by code + display name | - | Plan links |
| P0-02 | Apple, email code, guest upgrade | - | Account deletion |
| P0-03 | Create, join, member list | - | Revoke, regenerate, remove, transfer |
| P0-04/05 | Map+list, 40 experiences, activity+price filters | - | Date filter, Search this area, unknown-price toggle |
| P0-06 | Full | - | |
| P0-07 | Not shown | - | Full |
| P0-08/09 | Full, Close now | - | |
| P0-10 | Draft from winner | - | Organizer override |
| P0-11/12 | Flexible-time experiences | - | Fixed sessions, unknown-fact acknowledgement |
| P0-13 | RSVP | - | Plan links, adding invitees |
| P0-14 | Time change + reconfirm | - | All material fields, minor edits |
| P0-15 | Booking notice | - | Cancellation |
| P0-16/17 | Needs response, Open picks, Upcoming; groups, group detail | - | Drafts, Past, profile defaults |
| P0-18 | Not shown | - | Full |

## M1 Database (done)

Migrations `supabase/migrations/20261110120000..700_*.sql`: all P0 tables, RLS, private helpers, RPCs, realtime
publication, pg_cron job, grants. RPC contract: `docs/rpc.md`.

Functions: `set_profile`, `create_group`, `preview_group_code`, `join_group`, `create_pick`, `add_option`, `cast_vote`,
`close_pick`, `close_due_picks` (cron every minute), `cancel_pick`, `override_pick`, `send_plan`, `respond`, `edit_plan`.

Tests (pgTAP, `supabase/tests/`): 238 assertions pass on Postgres 16 via `scripts/local-db/run-tests.sh`
(01 groups/codes 56, 02 picks 69, 03 plans 84, 04 security 29). `scripts/local-db/concurrency.sh` also passes
(10 parallel sends with one key -> 1 plan; 6 concurrent votes -> tally 6; 34 racing joins -> 30 members).
Covered: code alphabet and case-insensitivity, expired/revoked, 5 tries/min limit (user and IP), one open pick per group,
2-5 options, 1 h to 7 d deadline, the P0-09 worked example with the exact stored sentence, `send_plan` idempotency,
the P0-13 count sequence `1/5/0/0 -> 3/3/0/0 -> 3/2/1/0 -> 1/2/1/2 -> 2/2/1/1 -> 2/2/2/0`, `stale_revision`, a late joiner cannot read
a plan, guests vote/RSVP but cannot create groups/picks/plans, no direct table writes, function grants.

### Not verified yet (needs Docker, which this cloud session lacks)
- `supabase start` / `supabase test db` on the real stack with real pgTAP. Tests ran on plain Postgres 16 with a local
  pgTAP-compatible shim and a stub of Supabase's `auth` schema (`scripts/local-db/`). **Please run `npm run db:start && npm run db:test` once on a Docker machine and send me any failure.**
- The pg_cron migration (skipped on plain Postgres: "pg_cron not available" notice) and realtime publication on the real stack.
- `supabase gen types` (needs a running DB): run `npm run db:types` on a Docker machine; M2 may hand-write types until then.

### Spec kept as written; additions and deviations (nothing in a spec table or signature was changed)
Per instruction, no spec column or function signature was altered. Things added or interpreted:
- **Helper tables (not in spec):** `option_tallies`, `pick_voter_status` (live tallies and "5 of 6 voted"), `join_attempts` (rate limit).
- **Helper RPCs (not in spec):** `set_profile`, `preview_group_code`, `add_option` (named in spec, args were "..."), `cancel_pick`, `override_pick`.
- **Votes privacy (RLS deviation):** spec says members read `votes`; here `votes` is owner-only so "who voted what" is never exposed,
  and Realtime/tallies use `option_tallies` / `pick_voter_status`. Spec's open question "Tallies" still needs design confirmation.
- **`group_members.role`:** listed in P0-03's data line but missing from the Data model table; included.
- **Elided signatures chosen:** `create_pick`, `add_option`, `send_plan`, `edit_plan` as in `docs/rpc.md`.
- **`join_group` / `preview_group_code` return `{ok:false,error}`** for wrong/expired/too-many-tries (a raised error would roll back the attempt row).
- **Rate limit:** 5 failed tries/min per user and 20/min per IP (`x-forwarded-for`); expired/revoked codes do not count.
  A guest can create new anonymous users, so the per-IP cap is the real backstop (a shared venue IP shares those 20).
- **Deadline window** has 1 minute of slack each side so a client-computed "now + 1 h" is not rejected for latency.
- **`create_pick` retry:** no client key column exists on `picks`; identical options by the same organizer return the existing pick.
- **`respond`/`cast_vote` carry no request ID** (spec signatures): they are idempotent upserts, which gives the same retry guarantee.
- **Edits after start:** material edits are refused once the plan has started (`plan_started`); spec is silent.
- **D8 end time:** `edit_plan` takes explicit start and end; the client should keep the duration when moving the start.

### Gaps found that affect later milestones (decisions needed or noted)
- `picks` has no `closed_at`/`created_at`, so the result screen cannot show "Voting closed {time}" (show the deadline instead).
- `experiences` has no location-address column, provider-name column or image column: UI uses `area` + `meeting_point`,
  a category placeholder image, and the provider host from `booking_url`.
- `send_plan` refuses fixed-session experiences (`fixed_sessions_not_supported`): the `sessions` JSON shape is undefined (pilot scope).
- The P0 analytics "event log table" is mentioned in the spec but never defined; not built.
- Pilot-only functions not built: `cancel_plan`, `add_invitees`, plan links, `toggle_save`, group management (revoke, regenerate, remove, transfer), `submit_listing`, `review_submission`.
