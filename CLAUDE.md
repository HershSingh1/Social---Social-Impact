# Sidequest: working conventions

Mobile app for a group of friends in Austin to pick something to do and turn it into a plan with RSVPs.
**Source of truth:** `docs/spec.md` (P0–P2 spec; requirement IDs like P0-01). `docs/wireframe.html` is a grayscale
flow/copy/state reference, not a visual design. If they disagree, the spec wins; report the conflict.
Current scope: the **Nov 22 demo subset** only (spec "P0 demo subset", "In the demo" column). See `docs/progress.md`.

## Layout
- `app/` Expo (React Native) + TypeScript + Expo Router. Routes in `app/src/app`, alias `@/*` -> `app/src/*`.
  - `src/features/<auth|groups|discovery|picks|plans>/` screens, hooks and components per feature
  - `src/shared/{ui,lib,hooks}` design tokens, primitives, supabase client, time helpers
- `supabase/` migrations (`migrations/`), pgTAP tests (`tests/`), seed data (`seed.sql`), `config.toml`
- `docs/` spec, wireframe, progress, milestone plans

## Commands
- `npm install` (repo root: Supabase CLI) and `cd app && npm install`
- `npm run db:start | db:stop | db:reset | db:test` (root; need Docker, real stack + real pgTAP)
- `npm run db:test:local` / `db:stress:local`: same migrations and tests on plain Postgres 16, no Docker (`scripts/local-db/`)
- `npm run db:types` regenerates `app/src/types/database.ts` (needs Docker)
- `cd app && npm run typecheck`; `npm start` (dev client; Expo Go is NOT supported: Sign in with Apple)
- Install Expo-pinned deps with `npx expo install`; if that is blocked, take versions from `node_modules/expo/bundledNativeModules.json`.

## Non-negotiable rules
1. Clients never write tables directly. Every write is an RPC named in the spec "Functions" table. RLS on every table.
2. Spec tables and function signatures are a team contract. Do not change them silently: stop and ask.
3. Create-type writes carry a client-generated request ID / `client_key`; retries never duplicate.
4. Times: UTC + `time_zone` (America/Chicago). Show in that zone, name it on Review and Plan. Reject nonexistent DST local times.
5. Every data screen has Loading (skeleton), Empty, Error (Try again keeps what was on screen), Ready. Form errors go under the field, never clear input. Slow-action buttons show progress and cannot be double-tapped.
6. Device permissions are requested only at moment of use; every flow works when denied.
7. Accessibility: 44x44 pt targets, 200% text, screen-reader labels, status in words (never color alone).
8. Permissions are enforced server-side (RLS + functions); hiding a button is never the only protection.
9. Never log notes, contacts, calendar contents, budgets, photos or raw invite codes.

## App conventions
- Screens live in `app/src/features/<feature>/`, routes in `app/src/app/` are thin re-exports. Shared UI in `src/shared/ui`.
- Data: react-query + plain `supabase.from(...).select()` for reads (RLS), `supabase.rpc(...)` for every write; Realtime hooks
  invalidate queries. Every device always has a session (guest by default); use `useAuth()` / `useRequireAccount()`.
- Copy for error codes comes from `shared/lib/errors.ts` (spec wording). Pure logic gets a `*.test.ts` next to it.
- Jest: mock factories may only reference variables prefixed `mock`; mock `@/shared/lib/supabase` (it needs native storage).

## Database conventions
- Every schema change is a new migration in `supabase/migrations` (never edit an applied one). RPC contract: `docs/rpc.md`.
- New function => add an explicit `GRANT EXECUTE ... TO authenticated` (defaults are locked down in `..0700_grants.sql`).
  New table => enable RLS, add a SELECT policy, `GRANT SELECT ... TO authenticated`. No client write grants, ever.
- Functions are `SECURITY DEFINER` with `set search_path = public, pg_temp`; helpers live in schema `private`.
- Errors: raise an exception whose message is a snake_case code; the app maps codes to copy.
- Tests: pgTAP in `supabase/tests/NN_*.test.sql`; each file is standalone (helper header is duplicated on purpose).

## Process
Milestones M0..M6 (see `docs/progress.md`): stop after each, summarize, wait. Commit after each coherent step.
Placeholder content must have a clearly fake `source` (starts with `PLACEHOLDER:`).
Sandbox note: cloud sessions cannot run simulators or Docker; verify there with typecheck, SQL tests on Postgres, unit tests.
