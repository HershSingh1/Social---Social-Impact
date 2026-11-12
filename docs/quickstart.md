# Quick start for contributors

Sidequest is an Expo (React Native) app on a Supabase backend. This page gets you from a fresh clone to a first PR. The rules are in [`AGENTS.md`](../AGENTS.md); read them once before you write code.

## 1. Set up

You need a Mac with Xcode (for the iOS Simulator), Node, and access to the team's Supabase dev project.

```bash
git clone <repo-url> && cd repo
git checkout v2-figma
cd app && npm ci
cp .env.example .env
```

Ask a teammate for the dev project's `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EAS_PROJECT_ID`, and put them in `app/.env`. Use the anon key only, never a `service_role` key. Then check it:

```bash
npm run check:env
```

## 2. Run the app

Expo Go does not work here (native sign-in modules). Use a development build:

```bash
npx expo run:ios              # builds with Xcode, opens the Simulator
npx expo start --dev-client   # later runs: press i for the Simulator
```

Real iPhones and Android need an EAS build. See [`development-builds.md`](development-builds.md). If you see "Cannot find native module", your installed build is stale; rebuild it.

Sign in with an email code, Apple or Google. There are no guest accounts.

## 3. Check your work

From `app/`:

```bash
npm run typecheck
npm run lint
npm test
```

For database changes, from `supabase/tests/` (run `npm ci` once):

```bash
npm test    # runs every migration and pgTAP test in-process, no Docker
```

## 4. Find the code

| Area | Where |
|---|---|
| Routes (thin re-exports) | `app/src/app/` |
| Screens, by feature | `app/src/features/<feature>/` |
| Theme tokens and shared components | `app/src/ui/` (see [`ui-kit.md`](ui-kit.md)) |
| Supabase client, time, errors | `app/src/lib/` |
| Schema, RPCs, RLS | `supabase/migrations/` |
| pgTAP tests, seed data | `supabase/tests/`, `supabase/seed.sql` |

Data flow: react-query for reads, `supabase.rpc()` for every write, Realtime only to invalidate queries.

## 5. Pick up work

1. Take a Linear issue labeled `agent-ready`, and only if every decision it depends on is settled in [`spec-decisions.md`](spec-decisions.md). If one is still open, say so in a comment on the issue and stop.
2. Requirement IDs (P0-08 and so on) come from [`spec.md`](spec.md); [`linear.md`](linear.md) maps them to issues. Where documents disagree: spec-decisions, then spec, then Figma, then wireframe.
3. Use the branch Linear names for the issue, cut from `v2-figma`, for example `npajibo/tec-12-p0-06-experience-detail`.
4. Build the screen from its Figma frame. Take colors, sizes and fonts from `app/src/ui/theme.ts`, never hard-code them.
5. Open the PR into `v2-figma` with `Fixes TEC-12` in the body. One issue per PR, under about 400 lines of non-generated code.
6. A person reviews and merges. Don't merge your own PR.
7. Comment on the Linear issue with what you verified and what you couldn't. Issues labeled `needs-device` close only after someone runs them on real phones.

## 6. Rules that catch people out

- **No client writes.** Every write is an RPC with RLS behind it. Hiding a button is not protection.
- **`client_key` on every create**, so retries never duplicate.
- **Times** are stored in UTC plus `time_zone` (America/Chicago) and shown in that zone.
- **Every data screen** has Loading, Empty, Error (Try again keeps what was on screen) and Ready states. Form errors go under the field and never clear input.
- Tap targets are at least 44×44 pt, screens work at 200% text, every control has a label, and status is shown in words as well as color.
- **Never log** notes, contacts, calendar contents, budgets, photos or raw invite codes.
- **Expo APIs change each SDK.** This app is on SDK 58. Check the versioned docs before using one, and add native packages with `npx expo install <pkg>`, not `npm install`.
- **Changing a table or function signature** from the spec needs a `spec-decision` issue first.

## 7. Out of scope

Don't build P2 revenue (P2-06 to P2-10), niche spots, or anything about the demo. See `AGENTS.md` for the phase plan.

## Where to look when stuck

- Supabase project and auth setup: [`dev-project.md`](dev-project.md)
- Sign-in and access checks: `npm run check:auth` (usage in `dev-project.md`)
- Table definitions: [`core-schema.md`](core-schema.md)
