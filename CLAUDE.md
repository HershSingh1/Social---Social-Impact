# Sidequest

Mobile app for a group of friends in Austin to pick something to do and turn it into a plan with RSVPs.

## Sources of truth
- `docs/spec.md`: P0–P2 build spec. Requirement IDs (P0-08) are used everywhere: Linear, branches, commits, tests.
- `docs/spec-decisions.md`: conflicts and gaps in the spec, with the default we build with. Read before touching the data model.
- **Figma** (visual design): https://www.figma.com/design/CUXYzgoB8YBvoorBUj1Oly/Event-Planning-App?node-id=28-2943 Build every screen from its frame. Tokens live in `app/src/ui/theme.ts`; never hard-code a color, size or font in a screen.
- `docs/wireframe.html`: grayscale flow, copy and states only. Not a visual reference.
- `docs/linear.md`: where each requirement lives in Linear (TEC-/PRO- issue IDs) and the demo critical path.
- Precedence: spec > spec-decisions > Figma > wireframe. If two disagree, follow the higher one and add a row to `docs/spec-decisions.md`.

## Accounts
**No guests.** Every user signs in (Apple, Google or email code) before anything works. The spec's guest rules are superseded; see `docs/spec-decisions.md` D1 and D2. Never add anonymous auth, `is_guest`, or guest UI.

## Scope now
Demo subset for **Nov 22, 2026** (spec "P0 demo subset", column "In the demo"), then Pilot P0. P1 and P2 are planned in Linear only; don't build them.

## Stack and layout
- `app/`: Expo (React Native) + TypeScript + Expo Router. Routes in `app/src/app` are thin re-exports of screens in `app/src/features/<feature>/`. Shared code: `app/src/ui` (theme, components), `app/src/lib` (supabase client, time, errors).
- `supabase/`: `migrations/`, `tests/` (pgTAP), `seed.sql`.
- Data: react-query for reads (`supabase.from().select()`, RLS decides), `supabase.rpc()` for every write, Realtime only to invalidate queries.

## Rules
1. Clients never write tables. Every write is an RPC; RLS on every table; permissions checked on the server, hiding a button is never the only protection.
2. Tables and function signatures in the spec are a team contract. Changing one needs a `spec-decision` issue first.
3. Every create-type write carries a client-generated `client_key`; retries never duplicate.
4. Times are stored UTC + `time_zone` (America/Chicago), shown in that zone, zone named on Review and Plan. Nonexistent DST times are rejected.
5. Every data screen has Loading, Empty, Error (Try again keeps what was on screen) and Ready. Form errors go under the field and never clear input. Slow buttons show progress and can't be double-tapped.
6. Device permissions are asked at the moment of use; every flow works when denied.
7. Accessibility: 44×44 pt targets, works at 200% text, labels on every control, status in words, never color alone.
8. Never log notes, contacts, calendar contents, budgets, photos or raw invite codes.
9. Placeholder catalog rows have `source` starting with `PLACEHOLDER:`.

## Workflow (Linear + GitHub)
- Every change starts from a Linear issue. Branch name: the one Linear gives you (e.g. `npajibo/tec-12-p0-06-experience-detail`). PR body includes `Fixes TEC-12` so Linear moves the issue.
- Issues labeled `agent-ready` have what an agent needs: spec section, acceptance criteria, Figma node, files/area, out of scope. An agent working one should: read the issue, work on its branch, open a PR, and comment on the issue with what was verified and what wasn't.
- `needs-device` issues are closed only after someone runs them on real phones.
- One PR per issue where possible; keep PRs reviewable (under ~400 lines of non-generated code).

## Commands
- `cd app && npm install`; copy `app/.env.example` to `app/.env` with the Supabase dev project's URL and anon key.
- `cd app && npx expo start` (needs a development build for Sign in with Apple; Expo Go is not enough).
- `cd app && npm run typecheck`
- Add native packages with `npx expo install <pkg>`, never `npm install`, so versions match the Expo SDK.
- Expo SDK 58: check the versioned docs before using any Expo API (see `app/AGENTS.md`).
