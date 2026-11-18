// Edge Function `notify` (TEC-142, decision N4). Sends the rows of notification_log as Expo push notifications.
// Woken once a minute by the database (private.invoke_notify, pg_cron + pg_net) with the shared secret.
// Dry run: POST {"dry_run": true, "token": "ExponentPushToken[...]"} sends one fixed test push to that token
// and touches no outbox row. Setup and real-delivery check: docs/notify-function.md.
// Rule 8: this file logs counts only, never tokens, message text or row contents.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeEqual } from './auth.ts';
import { expoClient } from './expo.ts';
import type { Claimed } from './messages.ts';
import { processOutbox, type Store } from './send.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret) return json(500, { error: 'not_configured' });
  if (!safeEqual(req.headers.get('x-notify-secret') ?? '', secret)) return json(401, { error: 'unauthorized' });

  const body = await req.json().catch(() => ({}));
  const push = expoClient({ accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') || undefined });

  if (body?.dry_run === true) {
    const token = body.token;
    if (typeof token !== 'string' || !/^(Expo|Exponent)PushToken\[[^\]\s]+\]$/.test(token)) {
      return json(400, { error: 'token_required' });
    }
    try {
      const [ticket] = await push.send([{
        to: token, title: 'Sidequest', body: 'Test notification: delivery is working.', sound: 'default',
        data: { kind: 'organizer_nudge' },
      }]);
      return json(200, { dry_run: true, delivered: ticket.status === 'ok', error: ticket.status === 'error' ? ticket.error : undefined });
    } catch (e) {
      return json(502, { dry_run: true, delivered: false, error: e instanceof Error ? e.message : 'failed' });
    }
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store: Store = {
    async claim(batchSize) {
      const { data, error } = await db.rpc('claim_notifications', { batch_size: batchSize });
      if (error) throw new Error('claim_failed');
      return (data ?? []) as Claimed[];
    },
    async markSent(ids) {
      const { error } = await db.rpc('mark_notifications_sent', { ids });
      if (error) throw new Error('mark_sent_failed');
    },
    async removeTokens(tokens) {
      const { error } = await db.rpc('remove_invalid_push_tokens', { tokens });
      if (error) throw new Error('remove_tokens_failed');
    },
  };

  try {
    const summary = await processOutbox(store, push);
    console.log(JSON.stringify(summary));
    return json(200, summary);
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'failed');
    return json(500, { error: 'send_failed' });
  }
});
