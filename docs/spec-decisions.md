# Spec decisions

Conflicts and gaps found while reviewing `docs/spec.md` (Nov 10, 2026). Each entry has a **default** we build with until the team decides otherwise; each one is mirrored as a Linear issue labeled `spec-decision`. When a decision is made, record it here and update `spec.md` in the same PR.

Status: **Open** (default in use, decision pending) · **Decided** · **Changed** (the decision differs from the default).

## Team decisions that override the spec

| # | Decision | What changes in the spec | Status |
| --- | --- | --- | --- |
| D1 | **No guests.** Every user has an account and signs in before using the app. Nothing (Map included) works signed-out. A join code or link opened before sign-in is kept and applied right after sign-in. | P0-01 becomes "Join by code" for signed-in users. P0-02 drops guest upgrade and the "already has an account" guest case. The Guest column of the permissions table goes away. P0-13 plan links require sign-in. P0-17 drops the guest banner. No anonymous auth, no `profiles.is_guest`, no "guest" label. Demo D2: Jordan and Sam sign in, then join by code. | Decided Nov 10 |
| D2 | **Google sign-in moves to P0.** Sign-in methods are Apple, Google and email code. | P1-08 is pulled into P0-02. Android users get one-tap sign-in. | Decided Nov 10 |
| D3 | **The demo covers all of P0, then P1, then P2 group memory.** Each feature works for real along the demo path. Phases are built in order and each passes a check on real phones first. P2 revenue (P2-06 to P2-10) is on hold. | The spec's entry gates for P1 and P2 (pilot results) no longer apply to the demo. "Before the pilot" items become Phase 1b. Server drafts (C2) and session times (G6) are now required in Phase 1b. The Nov 22 date is dropped. | Decided Nov 10 |
| D7 | **The team designs the demo.** Its script, cast, staging and date are decided by the team closer to the time. AI agents don't plan or schedule it. | None in the spec. The three-act script in the Decision Register is a starting sketch, not a commitment. Phone checks test each phase's features, whatever the final demo looks like. | Decided Nov 10 |
| D8 | **Niche spots are a P2 feature.** Members of the local community can upload lesser-known spots that offer a more unusual experience than the venues in the catalog. It came from the revenue plan. | Not in the spec yet. Needs its own requirement (how uploads are reviewed, how niche spots differ from P0-18 suggested listings, whether it's free or paid). Not scheduled; tracked in Linear for definition. | Noted Nov 10 |
| D9 | **iOS only for now.** The team has no Android devices to test on, so we build and check on iPhone only. The app stays Expo + React Native, so Android and web are not ruled out later; we just don't build, test or accept work for them now. A browser preview (`npx expo start --web`) may be used to look at screens, but it is not a target and nothing is accepted on it. We do not build a separate web app first and port it to iOS: it would mean writing the UI twice, and native features (Sign in with Apple, maps, device permissions) would be built twice. | D2: Google sign-in stays in P0 and works on iPhone, so the Android client ID is not needed yet. G10: the Android phone in the demo is dropped, so every demo phone is an iPhone and Apple and Google sign-in are both checked on iPhone. `spec.md` "demo is done when" needs "at least one iPhone and one Android" changed to iPhones only. Android Maps key (TEC-103) stays in the backlog. TEC-4 drops the Android build. Rule 7 and the phone checks in AGENTS.md apply to iPhone. | Decided Nov 10 |

D4–D6 (fresh start from Figma, the `v2-figma` branch, Linear as tracker) are process decisions recorded in the Decision Register only.

## Agreed working rules (Decision Register verdicts, Nov 10)

| # | Rule | Verdict |
| --- | --- | --- |
| S2 | Code for each phase starts only after the previous phase passes on phones; design and decisions can start early. | Agree |
| W1 | Agents only start an issue once every decision it depends on is agreed. | Agree |
| W2 | Only `agent-ready` issues go to agents; setup tasks and judgement calls stay with people. | Agree |
| W3 | A person reviews and merges every PR. | Agree |
| W4 | Every issue opens with a plain-language summary. | Agree |
| W7 | The team assigns owners, not Claude. | Agree |

Still open: S8 and W6 (marked Change, no detail yet), W5 (Discuss), and every P and T row (no verdict yet). The demo rows (S1, S3–S7) are now the team's call under D7.

## Conflicts

| # | Topic | Conflict | Default we build with | Status |
| --- | --- | --- | --- | --- |
| C1 | Vote privacy | "Realtime subscriptions" has clients subscribe to `votes` rows and recompute totals; P0-08 says members never see who voted what. Subscribing to rows exposes `user_id` + `value`. | `votes` readable only by its owner. Server-maintained `option_tallies (option_id, yes, maybe, no)` and `pick_voter_status (pick_id, user_id, complete)`; Realtime on those. Same pattern for P1-01 availability. | Decided Nov 10 — approved by Noah for TEC-3 |
| C2 | Server drafts | P0-11 says drafts save to the server as fields change; P0-12 says Send *creates* the plan. No draft function, no place for draft recipients, no revision before send. | Demo: drafts live on the phone with their `client_key`; `send_plan` creates the plan. Pilot: add `save_draft(client_key, payload)` and a `plans.draft` jsonb column. | Open |
| C3 | P2 entry gate | Scope table: "at least 25 Austin venues in the catalog with repeat plans". P2 section: "at least 4 pilot groups sent a second plan within 28 days". | Both must hold. | Open |
| C4 | Private data and revenue | Revenue rules: saves and attendance are "never used to place paid items or shared with partners". P2-06 gives partners saves and reported-outing counts; P2-08 hides sponsored cards from people who saved them. | Reword the rule to "never used to *target* paid items or shared *per person*". Aggregates with at least 10 people are allowed; suppressing a card someone already saved is allowed. | Open |
| C5 | Budget | P0-17: budget only prefills the person's own filters. P1-05: used in a group filter. P2-03: a separate "budget comfort range". | One `profiles.budget_cap`. P1-05 uses it only after the person opts in. Drop the P2-03 range. | Open |
| C6 | Minor price edits | A lower price is a minor edit (same revision), but `price_snapshot` lives on `plan_revisions`. Price and booking changes come from the catalog, not the organizer. | Catalog changes reach plans through a server job. Material changes create a revision; minor ones update the current revision's snapshot and set `plans.updated_at`, which drives the "Updated" label. | Open |
| C7 | "Venue" | P0-14 lists "venue" as a material edit, but changing the experience is not an edit. | "Venue" means the meeting point. | Open |

## Gaps

| # | Gap | Default | Status |
| --- | --- | --- | --- |
| G1 | `group_members.role` is in P0-03 but not in the Data model table. | Add `role` (`owner`, `member`). | Decided Nov 10 — approved by Noah for TEC-3 |
| G2 | No functions for revoke code, leave group, allow back, or `save_draft`. | Add `revoke_code`, `leave_group`, `allow_back` (pilot) and `save_draft` (pilot). | Open |
| G3 | Analytics "event log table" in P0 is never defined. | `events (id, user_id, name, props jsonb, created_at)`, insert-only through `log_event`. | Open |
| G4 | `picks` has no `created_at`, `closed_at` or title. | Add all three; title defaults to "What should we do?". | Decided Nov 10 — approved by Noah for TEC-3 |
| G5 | `experiences` has no image, street address or provider name. | Add `image_url`, `address`, `provider_name`. | Decided Nov 10 — approved by Noah for TEC-3 |
| G6 | `sessions` JSON shape undefined, so fixed sessions can't be validated. | `[{ "start_local": "2026-11-14T10:00", "end_local": "2026-11-14T12:00" }]` in America/Chicago. | Open |
| G7 | A removed listing loses what the plan showed. | Snapshot experience name and category on `plans`. | Decided Nov 10 — approved by Noah for TEC-3 |
| G8 | Account deletion and ownership transfer don't say who becomes owner. | Longest-standing account-holding member; never a guest. Archive if none. | Open |
| G9 | Realtime list covers only `votes` and `rsvps`, but the roster (5 s), hub and revision banner need live data. | Also publish `group_members`, `picks`, `pick_options`, `plans`, `plan_revisions`. | Decided Nov 10 — approved by Noah for TEC-3 |
| G10 | Sign in with Apple exists only on iOS; the demo uses an Android phone. | Maya (organizer) demos on the iPhone with Apple; the Android phone signs in with Google (D2). | Decided by D2 |
| G11 | T01 and T04 are named but defined in the product spec. | Copy definitions into `spec.md` "Demo acceptance". | Open |
| G12 | Table names differ between sections: `sponsor_impressions`/`sponsor_clicks` vs `sponsor_stats_daily`; `partner_stats_monthly` and `referral_programs` missing from the tables list; `availability.updated_at` missing. | Use the section names (P2-08, P2-06, P2-09, P1-01) and add them to the table list. | Open |
| G13 | Spec lists `create_group(name)`, but retries must not duplicate groups (rule 3) and `groups.client_key` exists. | Signature is `create_group(client_key uuid, name text)` returning `{group_id, code, expires_at}`; the same key returns the same group and its code. Limit 20 active groups per person. | Decided Nov 10 (TEC-27) |

## Figma vs spec (Linear PRO-9)

| # | Difference | Default | Status |
| --- | --- | --- | --- |
| F1 | Profile setup asks for full name, username, age and city; the spec has display name + optional avatar. | Demo collects display name only. | Open |
| F2 | "What are you into?" onboarding step (interests, typical spend) is P1-06 / P1-05 material. | Not in the demo. | Open |
| F3 | "Meet People & Safety" section: meeting strangers is outside P0–P2. | Not built. | Open |
| F4 | Join screen "Your name" field and "No account needed" copy. | Obsolete with D1; design to remove. | Open |
| F5 | Activity, Memories & Profile section is mostly P2. | Only profile basics in P0. | Open |

## Linear

Every entry above is tracked in Linear project "Sidequest P0–P2" (team Product & Design): D1/D2 → PRO-1 (done), D9 → PRO-13 (done), C1 → PRO-2, C2 → PRO-3, C3 → PRO-4, C4 → PRO-5, C5 → PRO-6, C6 → PRO-7, C7 → PRO-8, F1–F5 → PRO-9, G1–G12 → PRO-10.

## Checked, no conflict

- P0-09 worked example: Sketch and stroll 3·2 + 2·1 = 8, Clay and conversation 4·2 = 8, fewer No votes (1 vs 2) wins; Barton Springs 5 is third.
- P0-13 count sequence sums to 6 invitees at every step and each transition follows the state table.
- Demo steps D1–D8 are consistent with the P0 rules and the demo subset table.
