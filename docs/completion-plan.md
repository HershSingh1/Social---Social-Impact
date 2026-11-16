# Completion plan: finish P0, P1 and P2 memory, and get a testable build

Written Nov 16, 2026 against `v2-figma` at 21f3a26. Linear stays the source of truth for status; this file says what is left, what is in the way, and the order to do it in.

**In plain words.** Almost all of P0 is built. What is left of P0 is a profile screen, the "suggest a listing" screens, profile photos, the move to the Figma navigation, and a short list of bugs. P1 and P2 memory have not been started. The open decisions were made on Nov 16, so backend work can start; app work waits on Figma frames, which are listed in a brief for the designer. This plan says what is in the way, what people need to do and in what order, and gives a work order for agents.

**Scope.** P0, P1 (P1-01 to P1-07), P2 group memory (P2-01 to P2-05) and niche spots (D8, now in Phase 3). P2 revenue (P2-06 to P2-10) stays on hold. iOS only (D9). "Testable build" means an iPhone build against the dev Supabase project plus a simulator check per phase. It is not the demo: the team owns the demo's script and date (D7).

## Where things stand

| Area | State |
| --- | --- |
| P0 backend | Done. 23 migrations; every function has a pgTAP test. One bug and some tightening left (part C). |
| P0 app | P0-01 to P0-16 built. Missing: profile screen (P0-17), all of P0-18, profile photos, the Figma navigation (TEC-111 to 117). |
| P1 (TEC-58 to 64) | Not started. Single parent issues, no backend. Some first-draft frames. |
| P2 memory (TEC-65 to 69) | Not started. Same. |
| Niche spots (PRO-12) | No requirement written. |
| Build and checks | No CI. No TestFlight profile. Hosted Supabase checklist in `docs/dev-project.md` unticked. All phone checks pending. |

## A. What is in the way

### A1. Decisions

Decided Nov 16 and recorded in `docs/spec-decisions.md` ("Decisions for the P0 close-out, P1, P2 memory and niche spots"): D12 (who is an admin), F4, F6, G14, G17, R1 and N1 to N11. Function names and tables for each P1 and P2 requirement are in those rows. Nothing in this list blocks an agent any more.

Still for people:
- Legal: Terms, Privacy Policy and a content policy for photos, before the album (P2-02) or niche spots (P2-11) ship.
- Add the first admin to `private.reviewers` on the dev project.

### A2. Design

Under D11 a screen without a Figma frame isn't built. The Figma file has 31 frames, including first drafts for several P1 and P2 screens (3.2 quiz, 3.3 and 3.4 availability, 6.1 Activity, 6.2 album, 6.3 profile, 6.4 bucket list, 6.5 calendar and notifications, 4.6 post an event). Some of those show things the decisions rule out (naming who is busy, public reviews, group suggestions), so they need changes before agents build from them. Other screens have no frame at all: settings, owner controls, plan link, cancel, save sheet, the suggest form's review queue, did-it-happen, feedback, plan again, contact invites.

The design brief lists every frame to add or change, in priority order: https://claude.ai/artifact/VN8MCuQPyH2r7WbQsWMQiq

### A3. Accounts and setup

- EAS project ID (missing from `app/.env`, so a device build fails its own config check).
- App Store Connect app record for TestFlight.
- Hosted Supabase checklist in `docs/dev-project.md`: Mailgun SMTP, Google OAuth clients, `pg_cron` on, anonymous sign-in off.
- Storage buckets: `avatars`, `listing-images`, later `album`.
- APNs key and Expo push credentials before P1-04. This isn't written down anywhere yet.

### A4. Content

All 100 catalog rows are `PLACEHOLDER:` rows with no image and no `checked_on` (TEC-28, TEC-85). P2-05 collections also need someone to choose them.

### A5. Bugs found on `v2-figma`

- **Deleting an account fails** for anyone who has suggested or reported a listing. The tables added in `20261111000800_suggest_listing.sql` point at `profiles` with no on-delete rule, and `delete_account` was written before them.
- **"Start a plan" on an activity's detail screen is broken.** `ExperienceDetailScreen.tsx` passes `experienceId`; `app/plan/new.tsx` reads `group` and `experience`. There is also no way to choose which group.
- **The pick builder** asks for times as raw ISO text, makes its request ID with `Math.random`, and shows the deadline in the phone's zone instead of America/Chicago.
- **Dev screens** (`app/dev/*`) can be opened by any signed-in user.
- **Smaller backend items:** `edit_plan` doesn't apply the note and meeting-point length limits; `pick_voter_status` keeps people who left the group; the 20-group limit counts archived groups on join; the Plans hub listens to five whole tables.
- **`app.config.js` still turns on Sign in with Apple**, which D10 moved to P2.

### A6. Process

- No CI, so nothing stops a failing PR from merging.
- Linear drift: TEC-100 is In Progress with no branch or claim; parents TEC-13 and TEC-24 are still In Progress; TEC-106 and TEC-107 are duplicates; TEC-104 is labeled P2 inside the Phase 1a milestone.

## B. What people need to do, in order

1. **PR #71 is merged.** Close PRO-22, PRO-7, PRO-9 and PRO-10 if still open. Commit the claim-protocol edits to `AGENTS.md` and `docs/linear.md`.
2. **Read the Nov 16 decisions** in `docs/spec-decisions.md` and reopen any you disagree with.
3. **Designer:** frames in this order.
   1. P0: PRO-15 to PRO-20, TEC-109.
   2. P1: availability on a pick, calendar settings, notification settings, quiz, contact picker.
   3. P2: did it happen, album, feedback, plan again, bucket list, niche spots.
4. **Whoever owns setup:** create the EAS project and share `EAS_PROJECT_ID`; create the App Store Connect record; tick the hosted Supabase checklist; create the buckets once G14 is decided; name an admin and add them to `private.reviewers`; get the APNs key before P1-04.
5. **Linear:** create the new issues in part C, label the "start now" ones `agent-ready`, split each P1 and P2 parent as in part D once its decisions are recorded, and fix the drift in A6. To start an agent, move the issue to In Progress and tell the agent "work TEC-NN".
6. **Content:** check the catalog rows (source, `checked_on`, image, coordinates).
7. **Legal texts** before P2-02 or niche spots start.
8. **Review and merge every PR. Run the phone checks** (TEC-47 to 57, 75, 76, 77) on real iPhones.

## C. P0 closeout: work for agents

Rules for every item here and in part D:
- Branch from `v2-figma`. One issue per PR, under about 400 lines. Follow the claim steps in `AGENTS.md`.
- Never edit an old migration. Each backend issue adds one new migration file and one test file.
- Each new feature lives in its own folder under `app/src/features/` and adds a single line to any shared screen.

Patterns to copy:

| For | Copy from |
| --- | --- |
| Migration (RLS on, revoke and grant, `security definer set search_path = ''`, `require_profile()`) | `supabase/migrations/20261111000200_saves.sql` |
| Cron job | `supabase/migrations/20261110000900_close_pick.sql` |
| pgTAP test | `supabase/tests/saves.test.sql`; run with `cd supabase/tests && npm test` |
| Create-type write with `client_key` and Retry | `app/src/features/plans/draft.ts` |
| Realtime that only invalidates queries | `app/src/features/plans/usePlan.ts` |
| Loading, Empty, Error, Ready | `Loading`, `ErrorState`, `Empty`, `Sheet`, `Button` in `app/src/ui/index.tsx` |

| # | Issue | Work | Waits on |
| --- | --- | --- | --- |
| 1 | new bug | Detail screen: fix the Start a plan parameters and add a group chooser | nothing |
| 2 | new bug | `delete_account`: on-delete rules for `submissions`, `listing_reports`, `private.reviewers`, `private.submit_listing_requests`; add a test with a submission | nothing |
| 3 | new bug | Pick builder: use `plans/TimeField.tsx`, `expo-crypto`, `lib/time.ts` | nothing |
| 4 | new | Show `app/dev/*` only in development builds | nothing |
| 5 | new | One backend migration: `edit_plan` limits, voter cleanup on leave, archived groups not counted | nothing |
| 6 | new | Plans hub Realtime filters | nothing |
| 7 | new | Google block in `supabase/config.toml`; remove the Apple plugin from `app.config.js` | nothing |
| 8 | TEC-112 | Bottom bar. Rewrites `(tabs)/_layout.tsx`, so it lands on its own before items 10 and 11 | nothing |
| 9 | TEC-114, TEC-115 | Username and interests backend | nothing |
| 10 | TEC-111, 113, 116, 117 | Map, Home, welcome and join, onboarding per Figma | items 8 and 9 |
| 11 | TEC-98 (app) | Profile screen: budget, how you get around, edit profile | TEC-109 frame, item 8 |
| 12 | new, two issues | Storage buckets; profile photo upload with `expo-image-picker` | nothing |
| 13 | TEC-100 | Suggest form, report outdated info, reviewer queue | PRO-15 frame, item 12 |
| 14 | new | P0-15: provider link on Review and Plan; warning when a session is no longer listed | nothing |
| 15 | new | Retry-safe functions (`set_save`, required `client_key` on `create_pick`) | nothing |

Items 1 to 7 and 14 can start now and don't touch each other's files, except that 1 and 14 both touch plan screens: run 14 after 1.

## D. P1, P2 memory and niche spots: work for agents

Backend first, then the app once the frame exists. "Phone only" means agents can cover it with unit tests and typecheck, but the real behaviour needs a person with an iPhone.

| Req | Backend (migration + pgTAP) | App | Phone only |
| --- | --- | --- | --- |
| P1-01 Availability | `availability`, a count table kept by trigger, `set_availability`; test that `close_pick` ignores it | `features/availability/`; one line each in the voting and builder screens | |
| P1-02 Calendar free/busy | `calendar_shares`, `set_calendar_share` | `expo-calendar`; the overlap rule as a plain function with jest tests; Settings entry | yes |
| P1-03 Add to calendar | none | `features/calendar/addToCalendar.ts`; one button on the plan screen | yes |
| P1-04 Push | Three PRs: tables and token/preference functions; outbox written by triggers, one-hour reminder job, `nudge` with its limit; `supabase/functions/notify` as a thin sender | `expo-notifications`; `features/notifications/` (ask at first join or send, open the right screen on tap, Settings switches) | yes |
| P1-05 Budget-safe filtering | `budget_opt_in`; `group_budget_hidden`; tests that no response reveals a cap | Chip in the pick builder; switch on Profile | |
| P1-06 Quiz | TEC-115 | `features/interests/`; ordering in `useDiscovery.ts` | |
| P1-07 Contact invites | none | `expo-contacts`, `expo-sms`; `features/invites/` | yes |
| P2-01 Did it happen? | `outing_reports`, `attendance`, `report_outing`, `report_attendance`, `group_history` | `features/memory/`; prompt on the plan screen, card on the group screen | |
| P2-02 Shared album | Three PRs: tables and functions; private `album` bucket and its rules; removing location data from photos | `expo-image-picker`, `expo-image-manipulator` (re-encode to JPEG on the phone); upload with Retry | yes |
| P2-03 Feedback | `feedback`, `preferences`, their functions, `feedback_summary`; tests that unshared feedback is never returned | Feedback sheet; preferences on Profile | |
| P2-04 Plan again | `plans.repeat_rule`, `set_repeat`, a due-repeat job that writes to the P1-04 outbox | Plan again builds a draft on the phone and shows any price change | |
| P2-05 Bucket list | `bucket_items`, `toggle_bucket_item` (same shape as saves), `collections` | Bucket tab next to Saved ideas; collection chip on the map | |
| Niche spots | A marker on `submissions` and `experiences` for user-added spots; the rest reuses `submit_listing`, `review_submission`, `report_listing` and `get_profile_cards` | "Add a spot" from the + button, reusing the TEC-100 form; a Local spots chip and badge on map, list and detail | photo |

### Niche spots (P2-11)

A niche spot is a lesser-known place that a signed-in user adds. It goes through the same review queue as a P0-18 suggestion. Once an admin approves it, it appears in the catalog marked as a local spot, with the name of the person who added it. Anyone can report it; the author can ask for it to be removed. It is free, and it doesn't depend on P2 revenue.

Before agents start: the designer adapts frame 4.6 and adds the label and filter, and TEC-100 and the storage buckets have landed. Then split PRO-12 into one backend, one app and one design issue.

### Order of work

| Wave | What runs |
| --- | --- |
| 0 (people) | Part B steps 3 to 5 |
| 1 (now) | Part C items 1 to 7 and 14; CI; the TestFlight profile; TEC-114, TEC-115 and item 15; TEC-112 on its own |
| 2 | Part C items 10 to 13; backend for P1-01, P1-02, P1-04 (first two PRs), P1-05 |
| 3 | P1 app work; backend for P2-01, P2-03, P2-05 |
| 4 | P2 app work, P2-02, P2-04, niche spots |

### Files only one agent may touch at a time

`app/src/app/(tabs)/_layout.tsx`, `app/src/app/_layout.tsx`, `app/src/ui/theme.ts`, `app/src/ui/index.tsx`, `PlanScreen.tsx`, `GroupDetailScreen.tsx`, `PickBuilderScreen.tsx`, `SettingsScreen.tsx`, `app/app.json`, `app/app.config.js`, `app/package.json`.

Any issue that adds a native package (`npx expo install`) changes the last three, so those issues run one after another, never side by side.

## E. Getting to a testable build

1. **CI.** `.github/workflows/ci.yml` on every PR into `v2-figma`: an app job (typecheck, lint, jest) and a database job (pgTAP).
2. **TestFlight.** Add a `preview` profile and a `submit` block to `app/eas.json`; set `ITSAppUsesNonExemptEncryption` to false in `app/app.json`; make the config check in `app.config.js` cover the new profile. TestFlight internal testing avoids registering each iPhone by hand.
3. **Test accounts.** Email-code sign-in can't be automated against the hosted project. Add a script that creates four accounts on the dev project (an organizer, two members, an admin), one group and one sent plan, and a development-only way to sign in as one of them.
4. **Simulator check per phase.** An agent builds the `development-simulator` profile and walks a checklist in `docs/smoke.md` on the iOS Simulator, recording pass or fail for each flow. Other users act through scripts in the style of `check:send-plan`.
   - P0: sign in, onboarding, join by code, find an activity, save, pick, vote, close, plan, send, answer, edit and reconfirm, cancel, suggest a listing, delete account.
   - P1: an availability count changing when a second user answers; calendar, contacts and notifications each denied; budget filter; retaking the quiz.
   - P2: report an outing, attendance, add and delete a photo, feedback staying private, plan again showing a price change, adding a local spot.

What the simulator can't cover, and so still needs a phone: push delivery, the real calendar, contacts and SMS, the camera, and the timing targets.

## Risks

- **Design is the critical path.** If frames arrive late, app work for P1 and P2 waits no matter how many agents are free.
- **Removing location data from photos on the server** is the hardest technical piece. Re-encoding to JPEG on the phone first keeps the server part small.
- **Push can't be checked end to end by agents.** Keeping who-gets-what in SQL lets pgTAP cover it; delivery itself is a phone check.
- **Privacy.** Budget filtering and group summaries need tests that prove a private value is never returned, not only tests that the feature works.
- **PR size.** P1-04 and P2-02 are three or four PRs each.
