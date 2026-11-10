# Local setup (on your machine, with Docker)

```bash
npm install                       # repo root: Supabase CLI
cd app && npm install && cd ..    # Expo app
cp supabase/.env.example supabase/.env
npm run db:start                  # Postgres, Auth, Realtime, Studio; prints API URL and anon key
npm run db:test                   # pgTAP suite against the real stack
cp app/.env.example app/.env      # set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from db:start
```

Phones cannot reach `127.0.0.1` on your laptop: use the laptop's LAN address (for example
`EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.20:54321`) on real devices; the iOS simulator can use `127.0.0.1`, the
Android emulator needs `10.0.2.2`. Email codes sent locally are caught by Mailpit/Inbucket (URL printed by `db:start`).

## Run the app (development build, not Expo Go)
```bash
cd app
npx expo run:ios        # or: npx expo run:android   (first run builds the native project)
npm start               # afterwards, Metro for the installed dev client
```
Sign in with Apple needs a real iOS device or a simulator signed in to an Apple ID, plus the "Sign in with Apple"
capability on the app id `app.sidequest.mobile`. It is iOS only; Android uses the email code.

## Seed data and the Android map key
- `supabase db reset` loads `supabase/seed.sql` (42 placeholder experiences). On a hosted project use
  `supabase db push --include-seed`. Replace the placeholders with checked listings before the pilot.
- Android map: put a Google Maps SDK for Android key in `app/.env` as `GOOGLE_MAPS_ANDROID_API_KEY`, then rebuild the
  dev client (`npx expo run:android`). iOS needs nothing.

## Without Docker (cloud sessions, CI)
`npm run db:test:local`, `npm run db:stress:local` and `npm run db:seed:check` run the migrations and tests on plain Postgres 16.
`cd app && npm test` runs the app unit and component tests; `npm run typecheck` checks types.

## Hosted project (needed for the demo on real phones)
1. Create a Supabase project; Authentication -> Sign In / Providers: enable **Anonymous sign-ins**, **Email** (OTP, 6 digits,
   expiry 600 s) and **Apple** (Client IDs = `app.sidequest.mobile`); Authentication -> Settings: **Allow manual linking** on.
2. `supabase link --project-ref <ref>` then `supabase db push` (every schema change is a migration in `supabase/migrations`).
3. Enable the `pg_cron` extension (Database -> Extensions) before the push so `close_due_picks` is scheduled.
4. Put the project URL and anon key in `app/.env` (never commit it).
