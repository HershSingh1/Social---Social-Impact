# Progress

Scope: Nov 22 demo subset only. Status per requirement ID. Deferred = "Before the pilot" column of the spec.

| Milestone | Status |
| --- | --- |
| M0 Plan and scaffold | Done (see `docs/m0-plan.md`) |
| M1 Database | Done (pushed `8168a9d`) |
| M2 Accounts and groups (D1, D2) | Done in code, not yet run on a device (see below) |
| M3 Discovery (D3) | Done in code, not yet run on a device (see below) |
| M4 Group pick (D3-D5) | Done in code, not yet run on a device (see below) |
| M5 Plans (D6-D8) | Done in code, not yet run on a device (see below) |
| M6 Hubs and polish | Done in code; D1-D8, T01, T04 still to be run on devices (`docs/demo-runbook.md`) |

| Req | Demo scope | Status | Deferred to pilot |
| --- | --- | --- | --- |
| P0-01 | Join by code + display name | M2 done (component-tested; not run on a device) | Plan links |
| P0-02 | Apple, email code, guest upgrade | M2 done (component-tested; Apple/email upgrade need a real backend to verify) | Account deletion, avatar |
| P0-03 | Create, join, member list | M2 done (live roster via Realtime + 5 s poll) | Revoke, regenerate, remove, transfer |
| P0-04/05 | Map+list, 40 experiences, activity+price filters | - | Date filter, Search this area, unknown-price toggle |
| P0-06 | Full | M3 done (actions Start a plan / Add to group pick arrive with M5 / M4) | |
| P0-07 | Not shown | - | Full |
| P0-08/09 | Full, Close now | - | |
| P0-10 | Draft from winner | M5 done ("Plan this"; the organizer's choice when nobody voted) | Organizer override UI |
| P0-11/12 | Flexible-time experiences | - | Fixed sessions, unknown-fact acknowledgement |
| P0-13 | RSVP | M5 done | Plan links, adding invitees |
| P0-14 | Time change + reconfirm | - | All material fields, minor edits |
| P0-15 | Booking notice | - | Cancellation |
| P0-16/17 | Needs response, Open picks, Upcoming; groups, group detail | M6 done: Plans hub + tab badge, Friends next item, Group detail picks and plans | Drafts, Past, profile defaults |
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

## M2 Accounts and groups (done in code; D1 and D2 not yet run on devices)

Built (app/src): theme + accessible UI kit (44 pt targets, in-button progress, errors under fields, skeleton / empty /
error states, "Try again keeps what was on screen"), `AuthProvider`, Join flow, Sign-in sheet, Create group, Group detail,
Friends tab, routes (`sidequest://join/CODE` works), live roster.

How it works
- **Every device gets a guest session on first launch** (`signInAnonymously`) so the catalog and RPCs work without a
  sign-in wall; browsing needs a session because RLS grants only the `authenticated` role. A guest joins by code after
  `set_profile(name)` + `join_group(code)`.
- **Guest upgrade keeps the same user id.** Apple: `auth.linkIdentity({provider:'apple', token, nonce})` (native id token,
  supabase-js 2.119). Email: `updateUser({email})` then `verifyOtp(type:'email_change')`. A DB trigger flips
  `profiles.is_guest` when auth marks the user non-anonymous.
- **"This sign-in already has an account"** is shown when the Apple ID / email belongs to another account and the guest has
  groups to lose; a guest with nothing to lose is switched silently. Switching never merges data (spec).
- **Sign in and return to the same step:** `useRequireAccount()` sends guests to `/sign-in?returnTo=...`; only in-app
  paths are accepted as `returnTo`. Create group, and "Sign in instead" on an invitation, both come back to where they were.
- **Live roster:** Realtime on `group_members` invalidates the member query; a 5 s poll is the backstop for the
  "within 5 seconds" criterion. Join codes are readable by every member (spec), including guests.

Verified here (no simulators or backend in this environment)
- `tsc` clean; `expo export` bundles for Android and iOS; 49 Jest tests pass (pure logic, plus component tests with a
  mocked data layer covering: spec error copy, typed text kept on every error, incomplete code never hits the server,
  preview never joins, guest name required, double-tap blocked, return-to-step, unsafe return-to rejected, five-try OTP
  cap in the UI, anonymous bootstrap + retry, guest upgrade keeps the user id, Loading/Empty/Error/stale states).
- M1 database tests and concurrency checks unchanged and passing.

**Not verified (needs your machine):** D1 and D2 on real phones; the Apple link and email upgrade against a real Supabase
Auth (including whether the local config's `enable_confirmations = false` changes the email-change flow); Realtime timing;
screen-reader and 200 % text behaviour on device. `docs/setup.md` has the steps.

Decisions and assumptions to confirm
- **Anonymous bootstrap on first launch** (see above). Side effect: one `auth.users` row per install, and Supabase's anonymous
  sign-in rate limit (30/hour/IP locally) applies; raise it for a venue full of phones if the demo hits it.
- **OTP "at most 5 tries"** is enforced in the UI only. Supabase rate-limits verification per IP, not per code, so a hard
  per-code limit would need a server-side function (not in the spec's function list).
- **Session tokens are in AsyncStorage**, not SecureStore (hardening item before the pilot).
- Sign in with Apple is iOS only; Android demo phones use the email code.
- Typed routes (Expo Router experiment) turned off; routes are plain strings via `href()`.
- Avatar upload (P0-02) and sign out are not built (profile defaults and account deletion are pilot scope; the spec has no sign-out).
- `react-dom@19.3.0` is now an explicit dependency: a clean `npm install` failed (npm picked `react-dom@19.3.1`, which needs
  `react@19.3.1`; SDK 58 pins 19.3.0). `jest-expo` and Testing Library 14 are now installed.

## M3 Discovery (done in code; D3 browsing not yet run on a device)

Built: Map tab as home with price pins, preview card, List view sharing the same results, search (300 ms debounce),
Activity and Price filters, locate button, Experience detail, 42-row seed.

- **Map and List are two views of one state** (search, filters, selection), in `DiscoveryScreen`. Switching keeps the
  selection and the list opens scrolled to it. A selection hidden by the current filters is not shown and comes back if
  the filter is relaxed. Every pin is also a list row.
- **Price rules** are implemented as the spec says: a cap matches when the *known maximum* is at or under it (estimated
  uses the top of the range); unknown prices match a cap only when "include unknown prices" is on. That toggle ships in
  the pilot, so the demo uses the spec default (on): unknown-price experiences stay visible with "Price unknown".
  Price options: Any, Free, Under $25, Under $50.
- **Location** is requested only when "Locate me" is tapped. Denied (or failing) shows a notice, the map stays on
  downtown Austin, and search, filters and the list all keep working.
- **Seed:** `supabase/seed.sql`, 42 experiences, 6 per category, all four price kinds, all three timing kinds, some
  booking-required. **Every row is placeholder content** (`source` starts with `PLACEHOLDER:`), including the 13 from the
  wireframe, because I cannot verify any listing. Coordinates are approximate. Stable ids, safe to re-run. Local: loaded by
  `supabase db reset`. Hosted: `supabase db push --include-seed`. `npm run db:seed:check` validates it (13 checks).
- M1 database tests now clear the catalog inside their transaction, so they pass with the seed loaded (verified: 238 pass
  with `LOAD_SEED=1`).

Verified here: `tsc` clean; both platforms bundle; 82 Jest tests pass (15 suites): price/search/filter rules, label
formatting, Map/List shared state and selection, empty/loading/error/stale states, location denied and granted,
Detail for every price and timing kind, booking notice and provider link, removed listing.
**Not verified (needs a device):** the map actually rendering, pin taps and camera moves, the locate permission prompt,
list scroll-to-selected on real layouts, screen-reader and 200 % text behaviour.

Decisions and gaps
- **Android needs a Google Maps key** (`GOOGLE_MAPS_ANDROID_API_KEY` in `app/.env`, wired by `app/app.config.ts`); without it
  the Android map is blank. iOS uses Apple Maps. Both need a development build rebuild after adding the key.
- **Context chips** (Explore Austin / My saves / group chips) are not shown: saves are not in the demo, so there is nothing
  to switch between. Add them with P0-07.
- **No actions on Detail yet.** "Start a plan" and "Add to group pick" arrive with M5 and M4; the demo step that adds three
  experiences to a pick (D3) therefore completes in M4.
- **`sessions` shape** for fixed-time experiences is `[{"label": "Sat 10:00 AM"}]` (display only). Still open: structured
  day/time fields needed to validate plans against sessions (pilot).
- **No image column** on `experiences`: every experience shows a category placeholder block.
- The **Location** fact shows `area` plus "Meet at: {meeting_point}" (the table has no street-address column).
- Analytics `experience_viewed` is not recorded (the event-log table is still undefined in the spec).

## M4 Group pick (done in code; D3-D5 not yet run on devices)

Built: pick builder (`/pick/new`), live pick screen (`/pick/[id]`), "Add to group pick" on Experience detail, Chicago
wall-clock time helpers (`shared/lib/time.ts`), shared `ConfirmSheet`, `OptionSheet` (moved to `shared/ui`), `WhenPicker`.

- **Builder:** the pick is assembled in memory (`PickBuilderProvider`) while the person browses; nothing is sent until
  "Open voting" (`create_pick`). 2-5 options, optional tie-break star, optional proposed time per option, deadline 6/12/24
  (default)/48 hours or custom (1 hour to 7 days, validated under the field). One open pick per group: the screen says so and
  links to it; the server refuses too. The same experience can be used twice at different times.
- **Voting:** Yes/Maybe/No radio buttons, tapping the selected one clears it, optimistic with Retry on failure ("Voting closed"
  when late). Bars and counts, points, "X of Y voted", a "Who has voted" list (names, never how they voted), "New option" tag,
  the tie-breaker rule from the start. Live via Realtime on `option_tallies` / `pick_voter_status` / `picks` / `pick_options`
  with a 3 s poll while open.
- **Close now** and **Cancel** ask for confirmation. **Result:** winner highlighted, the server's `tie_rule` sentence, options in
  final order, "Plan this" for the organizer, "{organizer} will send a plan" for members, "Planned" with a link to the plan, and a
  "Nobody voted" path where the organizer chooses an option (`override_pick`).
- Add to group pick: account required (returns to the experience); one group = automatic, several = choose; if the group has an open
  pick its organizer adds to it (`add_option`), anyone else is pointed to it.

Verified here: `tsc`; 50 new Jest tests (ranking incl. the P0-09 worked example, builder state, builder screen, pick screen in every
state, add-to-pick, Chicago/DST time helpers). **Not verified:** real-time updates between phones, the 2 s criterion, device layout.

Assumptions: the pick title is the fixed question "What should we do this weekend?" (no title column); "New option" is inferred
from vote positions (no per-option timestamp); the organizer's star cannot be changed after opening (no function for it).

## M5 Plans (done in code; D6-D8 not yet run on devices)

Built: plan draft + review (`/plan/new`), plan detail (`/plan/[id]`), organizer edit sheet, "Start a plan" on Experience detail,
shared `BookingNotice` (Detail, Review, Plan), an on-phone draft store.

- **Draft and review:** one scrolling screen. Group, recipients (everyone preselected, each can be unticked; none is allowed:
  "No other invitees yet"), Austin-time date/start/end, meeting point (prefilled, 1-200), note (500, counter), cost and booking
  notice, then a Review card (What, When with the zone named, Where, Who, Cost, Booking) and **Send invitation**.
  Messages sit under their own field: start in the past, end before start, a time that does not exist on a DST day,
  meeting point length, note length. Untouched fields are not scolded until Send is tapped.
- **Sending (T04):** the draft gets its request id (`client_key`) once; Send shows progress and cannot be double-tapped;
  "Invitations sent" appears only after the server confirms; a failure keeps the draft and shows "Invitation not sent. Your
  draft is saved, and Retry won't send it twice." Retry reuses the SAME key. Tested at the UI level (two calls, same key).
- **Plan detail:** live via Realtime on `rsvps` / `plan_revisions` / `plans` (+4 s poll). Counts (Going, Awaiting, Can't go, Needs
  reconfirm) always add up to the invitees; every invitee's status is in words. **RSVP is not optimistic**: the tapped button
  shows "saving", the previous answer stays until the server confirms, failure offers Retry, and an answer sent from a stale
  screen is rejected (`stale_revision`) with "answer again". Locked after the start time and when cancelled.
- **Material change:** the organizer's edit sheet says "N Going invitees will need to reconfirm" before saving (not counting the
  organizer or Can't go); after saving, invitees see a banner with the old and new time/meeting point and Still going / Can't go,
  answered against the new revision.
- **Access:** a member who was not invited sees "This plan isn't available to you" (RLS returns nothing).
- **Unknown hours** show "Hours unverified" and can be planned; **fixed-session** experiences are explained and cannot be sent yet.

Verified here: `tsc`; 56 new Jest tests (RSVP count sequence from P0-13, draft validation incl. the DST gap, store persistence
and request-id reuse, draft screen, retry with the same key, plan screen, edit sheet, Start a plan); both platforms bundle.
Two bugs found by the tests and fixed: a sent draft was immediately re-created, and an overnight plan could not take a note edit.
**Not verified:** two phones seeing each other's RSVPs live, the real DST/time-zone behaviour on device, layout at 200 % text.

Decisions and gaps
- **Drafts live on the phone only** (the spec says the server keeps them, but there is no draft function; the Drafts hub is pilot
  scope). They survive restarts and are labelled "Saved on this phone". Offline editing therefore always works; Send needs a connection.
- **End time is on the same day as the start** (11:30 PM at the latest), so plans created in the app cannot run past midnight yet.
  The server allows it; editing the note or meeting point of such a plan works.
- Cancellation, adding invitees, plan links and minor-edit "Updated" labels are pilot scope and not built (the plan screen already
  renders the cancelled state if the server sends one).

## M6 Hubs and polish (done in code)

Built: Plans tab (`PlansHubScreen`), tab badge, Friends "next item" lines, Group detail "Picks and plans", the demo database
script, and `docs/demo-runbook.md` for the three-phone run.

- **Plans hub:** Needs your response (Needs reconfirmation first, then Awaiting reply, each by start time), Open group picks
  ("Vote needed" first), Upcoming (by start time; a cancelled plan stays, labelled, until its original end time). Every plan is in exactly
  one section; each row has a date block, activity, time range, group and the viewer's status in words. "Start a group pick" at the top
  (a guest signs in and returns to the builder). Empty: "No plans yet" + "Find something to do". One live read (`useHub`) feeds the
  hub, the badge, Friends and Group detail; Realtime on `rsvps` / `plans` / `plan_revisions` / `picks` / `pick_voter_status` + a 5 s poll,
  so a material edit moves the plan on every Going invitee's phone without a refresh.
- **Tab badge:** plans needing a response plus open picks the viewer has not fully voted on, with a spoken label.
- **Friends:** each group shows its earliest upcoming plan the viewer is invited to ("Sketch and stroll, Sat Nov 14"), else
  "Group pick open, closes Mon 9:12 AM", else "No plan yet". **Group detail** lists the group's picks and only the plans the viewer is
  invited to, and says "Plans you weren't invited to stay hidden."
- **States:** every data screen has Loading (skeleton), Empty, Error (Try again keeps what was on screen) and Ready; checked by tests.

### Demo acceptance (docs/spec.md "Demo acceptance")
| Step | Backend (SQL `05_demo_script.test.sql`, 29 assertions) | App (Jest, mocked data layer) | On devices |
| --- | --- | --- | --- |
| D1 create group + code | pass | pass (Create group, sign-in returns to the sheet) | not run |
| D2 guests join, appear marked guest | pass | pass (Join flow, roster tags) | not run |
| D3 map filter, 3 experiences -> pick; guests see it | pass | pass (filters, add to pick, builder, hub) | not run |
| D4 votes, tallies on every phone | pass | pass (voting, tallies); realtime timing untested | not run |
| D5 Close now, same winner + sentence | pass | pass (result screen) | not run |
| D6 draft, review, send; 1 Going / 2 Awaiting | pass | pass (draft, review, send) | not run |
| D7 Going / Can't go, counts 2/0/1 | pass | pass (RSVP) | not run |
| D8 time change, reconfirm, back to 2 Going | pass | pass (edit sheet, banner, stale answer) | not run |
| T01 whole script with location denied | n/a | pass (location is only asked on tap; denied path tested) | not run |
| T04 network cut during send, retry = one plan | pass (+ concurrency script) | pass (same request id on Retry) | not run |

**I could not run D1-D8, T01 or T04 on an iPhone and an Android phone from this environment.** Everything that can be checked without a
device passes (`tsc`; 223 Jest tests in 31 suites; 5 pgTAP files, 267 assertions; concurrency, seed and bundle checks). The remaining risk is
the real-device behaviour listed under each milestone's "Not verified" (Realtime latency, Apple/email upgrade against a real Auth server,
maps, accessibility at 200 % text). `docs/demo-runbook.md` is the script to run.

### Known limits for the demo (all in this file above)
Fixed-session experiences cannot be planned; plans created in the app end by 11:30 PM the same day; drafts are kept on the phone;
all 42 experiences are placeholders; Android needs a Google Maps key; the OTP "5 tries" cap is UI-only.
