# notify Edge Function (P1-04, TEC-142)

`supabase/functions/notify` sends the rows of `notification_log` as Expo push notifications. It decides
nothing about who is told what; the triggers and the reminder job (TEC-137) already wrote one row per
(event, person). Rule 8: the log holds ids and a kind only, and the function logs counts only, never tokens
or message text.

## How it runs

**Scheduled, every minute.** pg_cron runs `private.invoke_notify()`, which calls the function through pg_net
when an unsent row is waiting (and does nothing otherwise). A minute's delay is fine for these messages, the
same cadence as the one-hour pick reminder, and it needs no trigger on every write.

Each run:

1. `claim_notifications(100)` takes unsent rows oldest first, in one statement with `for update skip locked`,
   and leases them for 10 minutes, so two runs never take the same row. Rows older than 24 hours are no
   longer sent. A person with no push token is settled without sending (the Plans hub still shows everything).
2. Messages go to Expo in requests of at most 100, a row never split across two.
3. After each request, rows where at least one device was accepted get `sent_at` (`mark_notifications_sent`),
   and tokens Expo calls `DeviceNotRegistered` are deleted (`remove_invalid_push_tokens`).
4. A row that failed (HTTP error, rate limit, no usable device response) keeps its lease and is claimed again
   when the lease ends, about 10 minutes later.

Not covered: Expo's second step, delivery receipts, which can report a dead token later than the send
response does. Those tokens are removed the first time a send response reports them.

## Setup (a person, once per project)

1. Create the APNs key and upload it to the Expo account (`docs/completion-plan.md` part B step 4).
2. Set function secrets: `supabase secrets set NOTIFY_SECRET=<long random string>`. Optional:
   `EXPO_ACCESS_TOKEN=<token>` if Expo's enhanced push security is on.
3. Deploy: `supabase functions deploy notify`.
4. Put two secrets in Vault so the database can call it (SQL editor):
   `select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify', 'notify_url');`
   `select vault.create_secret('<the same NOTIFY_SECRET>', 'notify_secret');`
   and make sure the `pg_cron`, `pg_net` and Vault extensions are on.

## Check real delivery (needs a phone and a development build)

1. Open the development build on a real iPhone, sign in, and allow notifications. This needs the app issue
   (TEC-150) so the phone registers its token. Until then, get a token from an Expo development build with
   `Notifications.getExpoPushTokenAsync` and use it in step 2.
2. Dry run, which sends one fixed test notification to that token and touches no outbox row:

   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/notify" \
     -H "x-notify-secret: $NOTIFY_SECRET" -H "Content-Type: application/json" \
     -d '{"dry_run": true, "token": "ExponentPushToken[...]"}'
   ```

   `{"dry_run":true,"delivered":true}` means Expo accepted it; the phone should show "Test notification:
   delivery is working." within a few seconds.
3. End to end: with a second account in the group, have it send a plan to the phone's account, wait up to a
   minute, and check the "… invited you: …" notification arrives. Check `notification_log.sent_at` is set.
4. Turn off "plan sent" in Settings on the phone, repeat, and check nothing arrives.

## Tests

`node --test supabase/functions/notify/notify.test.ts` (Node 24 or newer, no Deno) covers message text,
batching, failure leaving a row unsent, and invalid-token removal with Expo faked. The claim, lease and mark
functions are in `supabase/tests/notify_sender.test.sql`.
