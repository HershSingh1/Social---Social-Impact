# Development project (TEC-1)

Repository preparation is ready; the hosted project and provider setup are not verified.
Use the team's Supabase organization, not a personal or production project.

## Account owner steps

1. Create `sidequest-dev` near Austin (an available US central/east region). Save
   its database password privately. Record the project reference privately too.
2. Authentication → Providers: turn anonymous sign-ins OFF and email ON.
   Set email OTP length to **6** and expiry to **600 seconds**. Replace both
   Confirm signup and Magic Link email bodies with `supabase/templates/email-code.html`.
   Use an approved SMTP provider for team recipients; Supabase's default mail service
   restricts delivery. Never commit SMTP credentials.
3. Configure Apple with the paid team's `com.sidequest.app` identifier. Configure
   Google with the team's web, iOS and Android OAuth clients. Add all expected client
   IDs to the provider's allowed audience list; use the web client for browser OAuth.
   Register the callback URL shown by Supabase with each provider. Keep provider
   secrets in Supabase, never in the app. Apple browser OAuth also needs a Services ID
   and a maintained signing secret; native Apple authentication uses the bundle ID.
4. Authentication → URL Configuration: add `sidequest://auth/callback` for the
   development app. The app sign-in flow is implemented separately in TEC-34.
5. Database → Extensions: enable `pg_cron`. Verify with
   `select extname from pg_extension where extname = 'pg_cron';`.
6. Share the project URL and **anon/publishable** key privately. Never share a
   service-role key through `EXPO_PUBLIC_*`; these values are bundled into the app.

## Link and configure locally

From the repository root (Supabase CLI installed, or use `npx supabase`):

```sh
supabase login
supabase link --project-ref YOUR_DEV_PROJECT_REF
supabase migration list --linked
cp app/.env.example app/.env
```

Fill `app/.env` privately, then run `cd app && npm run check:env`.
The check rejects placeholders and privileged JWT roles without printing values.
The local `config.toml` documents Auth defaults; **linking does not configure
hosted Auth**. Complete and verify those dashboard settings separately.
After TEC-3 is reviewed, use `supabase db push --dry-run`, inspect the target and
migrations, then `supabase db push`. Never use `db reset --linked` on shared data.

## Check sign-in and access rules

After `npm run check:env` passes and the migration is pushed, run these from `app/`
(they print PASS or FAIL only, never keys or codes):

```sh
npm run check:auth -- anon                         # guests are off; signed-out visitors read nothing
npm run check:auth -- request you@team.com         # emails you a 6-digit code
npm run check:auth -- verify you@team.com 123456   # signs in with the code, then checks the access rules
npm run check:auth -- reject you@team.com          # a wrong code is refused
```

`request` creates an account for that address if none exists. Supabase's built-in email
only delivers to members of your Supabase organization and allows very few messages an
hour, so use a team address and wait between tries (or set up custom SMTP). To check that
an expired code fails, request a code, wait 10 minutes, then run `verify`: it should FAIL.

## Verification still required

- [ ] `supabase link` and `migration list --linked` succeed against the team dev project.
- [ ] A new and returning user receive a six-digit email code; expired codes fail.
- [ ] Anonymous sign-in is rejected, Apple works on iPhone, Google works on Android.
- [ ] All three phones use the same dev project; no credentials appear in Git.
- [ ] `pg_cron` is enabled. These checks have not been performed by this change.

References: [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config),
[email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[Google](https://supabase.com/docs/guides/auth/social-login/auth-google).
