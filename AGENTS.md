# Sidequest

Mobile app for a group of friends in Austin to pick something to do and turn it into a plan with RSVPs.

These are the working rules for every AI coding agent on this repo (Codex, Claude Code, or anything else) and for the people reviewing their work. `CLAUDE.md` imports this file, so there is one copy of the rules. Change them here.

## Sources of truth
- `docs/spec.md`: P0–P2 build spec. Requirement IDs (P0-08) are used everywhere: Linear, branches, commits, tests.
- `docs/spec-decisions.md`: team decisions that override the spec, plus conflicts and gaps with the default we build with. Read it before touching the data model.
- Figma is the visual design: https://www.figma.com/design/CUXYzgoB8YBvoorBUj1Oly/Event-Planning-App?node-id=28-2943 Build every screen from its frame. Tokens live in `app/src/ui/theme.ts`; never hard-code a color, size or font in a screen.
- `docs/wireframe.html`: grayscale flow, copy and states only. Not a visual reference.
- `docs/linear.md`: where each requirement lives in Linear (TEC-/PRO- issue IDs).
- Precedence: spec-decisions > spec > Figma > wireframe. If two disagree, follow the higher one and add a row to `docs/spec-decisions.md`.

## Accounts
There are no guests. Every user signs in with Apple, Google or an email code before anything works. The spec's guest rules are superseded (`docs/spec-decisions.md` D1 and D2), so never add anonymous auth, `is_guest`, or guest UI.

## Scope now
We build in three phases (decision D3). Phase 1 is all of P0, split into 1a (the core path) and 1b (the rest). Phase 2 is P1. Phase 3 is P2 group memory, P2-01 to P2-05. Each phase passes a check on real phones before the next phase's code starts, though design can run ahead.

Not in scope, so don't build them:
- P2 revenue (P2-06 to P2-10). On hold.
- Niche spots (decision D8): community-uploaded, lesser-known spots. Noted for P2, not yet specified.
- The demo itself. The team designs the demo, its script and its date (decision D7). Agents don't plan, script or schedule it, and shouldn't optimize work around a demo storyline.

## Stack and layout
- `app/`: Expo (React Native) + TypeScript + Expo Router. Routes in `app/src/app` are thin re-exports of screens in `app/src/features/<feature>/`. Shared code: `app/src/ui` (theme, components), `app/src/lib` (supabase client, time, errors). `app/AGENTS.md` has Expo-specific notes.
- `supabase/`: `migrations/`, `tests/` (pgTAP), `seed.sql`.
- Data: react-query for reads (`supabase.from().select()`, RLS decides), `supabase.rpc()` for every write, Realtime only to invalidate queries.

## Rules
1. Clients never write tables. Every write is an RPC; RLS on every table; permissions are checked on the server, and hiding a button is never the only protection.
2. Tables and function signatures in the spec are a team contract. Changing one needs a `spec-decision` issue first.
3. Every create-type write carries a client-generated `client_key`; retries never duplicate.
4. Times are stored UTC + `time_zone` (America/Chicago), shown in that zone, zone named on Review and Plan. Nonexistent DST times are rejected.
5. Every data screen has Loading, Empty, Error (Try again keeps what was on screen) and Ready. Form errors go under the field and never clear input. Slow buttons show progress and can't be double-tapped.
6. Device permissions are asked at the moment of use; every flow works when denied.
7. Accessibility: 44×44 pt targets, works at 200% text, labels on every control, status in words, never color alone.
8. Never log notes, contacts, calendar contents, budgets, photos or raw invite codes.
9. Placeholder catalog rows have `source` starting with `PLACEHOLDER:`.

## How agents work here (agreed by the team, Nov 10)
- Only pick up a Linear issue labeled `agent-ready`, and only once every decision it depends on is agreed in `docs/spec-decisions.md` or the Decision Register (https://claude.ai/artifact/5RqNeJLkWgALx3AzjdRdbK). If a decision is still open, stop and say so on the issue.
- One agent per issue. Two agents on the same issue or the same files will conflict; another agent may review the PR instead.
- Work on the branch Linear gives the issue (e.g. `npajibo/tec-12-p0-06-experience-detail`), cut from `v2-figma`. Open the PR into `v2-figma` with `Fixes TEC-12` in the body.
- A person reviews and merges every PR. Agents never merge their own work.
- When done, comment on the Linear issue with what you verified and what you couldn't (for example, anything that needs a real phone).
- Every issue starts with an **In plain words** summary for the team. If your work changes what the issue does, update that summary in plain language.
- `needs-device` issues are closed only after a person runs them on real phones.
- Keep PRs reviewable: one issue per PR, under ~400 lines of non-generated code.

## Commands
- `cd app && npm install`; copy `app/.env.example` to `app/.env` with the Supabase dev project's URL and anon key.
- `cd app && npx expo start` (needs a development build for Sign in with Apple; Expo Go is not enough).
- `cd app && npm run typecheck`
- Add native packages with `npx expo install <pkg>`, never `npm install`, so versions match the Expo SDK.
- Expo SDK 58: check the versioned docs before using any Expo API (see `app/AGENTS.md`).
