# M0 plan

## 1. Repo structure

```
CLAUDE.md                      conventions (persist across sessions)
package.json                   root: Supabase CLI + db:* scripts
docs/                          spec.md, wireframe.html, progress.md, m0-plan.md
supabase/
  config.toml                  anonymous sign-ins ON, email OTP 6 digits / 10 min
  migrations/                  one file per concern (extensions, tables, rls, functions, cron)
  tests/                       pgTAP (*.test.sql)
  seed.sql                     40+ experiences (placeholder-marked), dev users
app/                           Expo SDK 58, RN 0.88, Expo Router, TS strict
  src/app/                     routes: _layout, (tabs)/{index,plans,friends}, plus stack routes
  src/features/{auth,groups,discovery,picks,plans}/
  src/shared/{ui,lib,hooks}/   supabase client, time (America/Chicago), request-id, realtime helper
  src/types/                   generated DB types
```

Routes planned (stack on top of tabs): `join`, `sign-in`, `group/[id]`, `experience/[id]`, `pick/new`,
`pick/[id]`, `plan/draft`, `plan/[id]`. Sheets (create group, save, share, edit time) are modal routes or bottom sheets.

## 2. Screens mapped to requirement IDs (demo subset)

| Screen | Reqs | Demo step |
| --- | --- | --- |
| Join (code, preview, guest name, Apple, email code) | P0-01, P0-02 | D2 |
| Sign-in sheet with return-to-step | P0-02 | D1 |
| Friends tab (groups list, Create group, Join with code, guest banner) | P0-03, P0-17 | D1, D2 |
| Create group sheet | P0-03 | D1 |
| Group detail (members live, join code Copy/Share, open pick, my plans) | P0-03, P0-17 | D1, D2 |
| Map tab (pins, preview card, search, Activity + Price filters, locate) | P0-04, P0-05 | D3 |
| List view (same results/selection) | P0-04 | D3 |
| Experience detail | P0-06 | D3 |
| Pick builder (options, star, deadline, Open voting) | P0-08 | D3 |
| Group pick (vote, tallies, voted X of Y, Close now) | P0-08, P0-09 | D4, D5 |
| Pick result (winner, tie sentence, Plan this) | P0-09, P0-10 | D5 |
| Plan draft + Review | P0-10, P0-11, P0-12 | D6 |
| Plan detail (RSVP, counts, reconfirm banner, organizer edit time) | P0-13, P0-14, P0-15 (notice) | D6-D8 |
| Plans hub + tab badge | P0-16 | D3, D6, D8 |

## 3. Wireframe vs spec conflicts (spec wins)

| Topic | Wireframe | Spec (used) |
| --- | --- | --- |
| Join code format | fixed `SQ` prefix, alphabet drops L | any 6 chars from A-Z, 2-9 minus 0/O/1/I (L allowed) |
| Wrong-code copy | "That code doesn't match an invite." | "That code doesn't match a group" |
| Expired copy | "Maya revoked or replaced it..." | "This code has expired. Ask for a new one." |
| Group name limit | 40 | 50 |
| Share text | `sidequest.app/j/CODE` link | "Join {group} on Sidequest with code {code}"; deep link `sidequest://join/CODE` |
| Under $25 | strict `< 25` | at or under cap (`<= 25`); no "Under $50" in wireframe, spec has it |
| Tie sentence | "wins on fewer No votes" | "wins with fewer No votes" |
| Category labels | "Art & walks" etc. | "Art and walks" etc. |
| Group detail badge | "Organizer" | "Owner" |
| Pick options source | from group saved ideas | from Detail "Add to group pick"; saves are not in the demo |
| Context chips | My saves + group chip | Saves not shown in the demo, so only Explore Austin ships |
| Hard-coded dates | Nov 14-22 | demo is Nov 22; dates must be computed from the clock |
| Member roles | "Organizer: Maya" on group | group has an Owner; Organizer belongs to a pick/plan |

Wireframe items that are pilot-only and will be left out: Search this area, Date filter, unknown-price toggle,
override winner, cancel plan, minor edit, Drafts, Past, Save sheet, Suggest a listing, revoke/regenerate.

## 4. Spec gaps and contradictions

1. **Votes privacy vs Realtime.** Spec: members see totals and who voted, not who voted what; RLS line says members read
   votes; Realtime on `votes` lets clients recompute totals. Reading all vote rows exposes who voted what via the API.
2. **Draft persistence.** P0-11 says drafts save to the server, but the Functions table has no draft function, and
   Drafts hub is pilot. `send_plan(client_key, ...)` is the only plan creator.
3. **Elided signatures.** `send_plan(client_key, ...)`, `edit_plan(plan_id, changes)`, `add_option(pick_id, ...)` are
   incomplete. How local time, tz and recipients are passed is undefined.
4. **Missing functions needed by the demo:** profile creation/display name (`join_group(code)` has no name argument),
   code preview before joining (non-members cannot read `groups`), "pick becomes Planned" transition, `cancel_pick`.
5. **Rate limit identity.** "5 wrong codes per minute per device": an anonymous user can be re-created at will, so a
   per-user limit is bypassable. There is no table for attempts.
6. **Idempotency of `create_pick`.** Rule 3 and spec list creates needing request IDs, but `picks` has no `client_key`.
7. **Realtime scope.** Spec lists `votes` and `rsvps` only. D2 (members within 5 s), D5 (every phone sees the winner),
   D6 (plan appears in hub) and P0-16 (hub moves without refresh) also need `group_members`, `picks`, `plans`,
   `plan_revisions` changes. Publishing more tables is not a schema change, but it is beyond the written list.
8. **Guest upgrade keeping the user ID with Apple.** supabase-js links native Apple credentials to an anonymous session
   only through identity linking (needs `enable_manual_linking`); `signInWithIdToken` normally creates a new user. Needs a
   spike in M2. Email upgrade uses `updateUser`.
9. **Fixed-session data shape.** `sessions` JSON: weekly recurring ("Sat 10:00 AM") or dated? A plan needs a date.
10. **Time-change semantics (D8).** "Moves the start time 1 hour later": does the end move too? Wireframe keeps duration.
11. **Outright-win sentence.** Spec gives only the tie example. Wireframe copy "X has the highest score: 8 points to 5."
12. **Demo uses flexible experiences only for drafts, but the worked example uses Clay (fixed).** The demo script
    should use three flexible experiences; Clay stays in the SQL test.
13. **Android + Sign in with Apple.** Apple native sign-in is iOS only; Android demo phone uses email code.

## 5. Questions for you (see end of chat message for recommended defaults)

A. Votes privacy approach (gap 1).
B. Drafts in the demo: client-only until Send (gap 2).
C. Proposed signatures for the elided functions and the extra helper RPCs (gaps 3-4, 6).
D. Seed content: mark all 40 as placeholder (including wireframe ones, since I cannot verify them).
E. Backend for the demo: local Supabase on a laptop over LAN, or a hosted project (needed for real email OTP).
F. Rename `app/` to `mobile/`? (left as is.)

## 6. Environment constraints discovered

- Cloud container has no Docker daemon and no simulators. I can run typecheck, bundling and SQL tests on Postgres 16
  here; D1-D8, T01 and T04 on iOS + Android must be run on your machines. pgTAP is not installable here, so tests are
  written as pgTAP for `supabase test db` and mirrored by a plain-SQL harness I can execute locally.
- Proxy denies `reactnative.directory` and the Expo versions API, so `expo install` fails; versions were taken from
  `bundledNativeModules.json` and installed with npm. `expo-doctor` network checks fail for the same reason.
- App test runner (`jest-expo`) deferred: it requires `react-dom@19.3.1`, SDK 58 pins `react@19.3.0`.
