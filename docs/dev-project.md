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
   The dev project sends through Mailgun (Authentication → Emails → SMTP Settings):
   host `smtp.mailgun.org` (`smtp.eu.mailgun.org` for an EU domain), port `587`, the
   domain's SMTP username and SMTP password (not the API key), and a sender address on
   that same domain. While the domain is Mailgun's sandbox, each tester must be added
   under Authorized Recipients and confirm Mailgun's email (about 5 on the free plan).
   Before real users, verify a domain in Mailgun with SPF, DKIM and DMARC (TEC-105).
3. Authentication → Providers → Google: turn it ON and paste the web OAuth client's
   ID and secret. The app signs in through the browser, so the web client is the one
   that matters; add any other client IDs to the allowed audience list. Register the
   callback URL Supabase shows there as an authorized redirect URI on that client.
   This dashboard setting is what the hosted project uses: the
   `[auth.external.google]` block in `supabase/config.toml` only configures a local
   `supabase start`, which reads the same two values from `supabase/.env` (copy
   `supabase/.env.example`; for local runs also register
   `http://127.0.0.1:54321/auth/v1/callback`). Keep provider secrets in Supabase or
   that ignored file, never in the app or in Git.
   Sign in with Apple is P2 (D10, TEC-104): leave it off for now. The app no longer
   installs `expo-apple-authentication`, because Expo adds the Sign in with Apple
   capability to every iOS build whenever that package is present. To bring Apple back,
   run `npx expo install expo-apple-authentication`, add its plugin and
   `ios.usesAppleSignIn` in `app/app.config.js`, and use the paid team's
   `com.sidequest.app` identifier; browser OAuth also needs a Services ID and a
   maintained signing secret.
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
- [ ] Anonymous sign-in is rejected and Google sign-in works on an iPhone.
- [ ] All three phones use the same dev project; no credentials appear in Git.
- [ ] `pg_cron` is enabled. These checks have not been performed by this change.

References: [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config),
[email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[Google](https://supabase.com/docs/guides/auth/social-login/auth-google).
