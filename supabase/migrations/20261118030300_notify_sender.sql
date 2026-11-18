-- TEC-142 (P1-04 backend 3 of 3, decision N4): the database side of the `notify` Edge Function.
-- The function only sends what notification_log already holds. These service-role functions let it claim a
-- batch atomically, look up the pieces of each message, record success, and drop dead tokens. The log still
-- holds ids and a kind only (rule 8); names, titles and times are read here at send time and never stored.
begin;

-- A claimed row is leased: another worker will not take it until the lease ends, so two overlapping runs
-- never send the same row. A row that fails keeps its lease and comes back after it ends (the retry wait).
alter table public.notification_log add column claimed_at timestamptz;

-- Claims up to batch_size unsent rows, oldest first, and returns what the sender needs to write each message.
--   * Rows older than 24 hours are no longer sent: a reminder that late is wrong. They stay in the log, unsent.
--   * A person with no push token has nothing to send to: the row is marked sent and not returned. Everything
--     still shows in the Plans hub, and registering a token later must not replay old news.
--   * At most the 10 newest tokens per person, so one row never needs more than one Expo request.
-- Service role only; clients get no execute grant.
create function public.claim_notifications(batch_size integer default 100)
returns table (
  log_id uuid, kind text, user_id uuid, plan_id uuid, pick_id uuid, tokens text[],
  actor_name text, subject text, group_name text, at_time timestamptz, prev_at_time timestamptz, time_zone text
)
language plpgsql security definer set search_path = '' as $$
begin
  if batch_size is null or batch_size not between 1 and 500 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;
  return query
  with picked as (
    select l.id from public.notification_log l
    where l.sent_at is null
      and l.created_at > now() - interval '24 hours'
      and (l.claimed_at is null or l.claimed_at < now() - interval '10 minutes')
    order by l.created_at, l.id
    limit claim_notifications.batch_size
    for update skip locked
  ),
  claimed as (
    update public.notification_log l
      set claimed_at = now(),
          sent_at = case when exists (select 1 from public.push_tokens t where t.user_id = l.user_id)
                         then null else now() end
      from picked pk where l.id = pk.id
      returning l.id, l.kind, l.user_id, l.plan_id, l.pick_id, l.created_at, l.sent_at
  )
  select c.id, c.kind, c.user_id, c.plan_id, c.pick_id,
    (select array_agg(t.token order by t.created_at desc, t.token)
       from (select tk.token, tk.created_at from public.push_tokens tk
             where tk.user_id = c.user_id order by tk.created_at desc, tk.token limit 10) t),
    org.display_name,
    case when c.kind = 'pick_opened' then pick.title
         when c.kind = 'pick_result' then win.name
         when c.plan_id is not null then p.experience_name end,
    grp.name,
    case when c.kind = 'pick_opened' then pick.deadline else cur.start_at end,
    prev.start_at,
    coalesce(cur.time_zone, 'America/Chicago')
  from claimed c
  left join public.plans p on p.id = c.plan_id
  left join public.plan_revisions cur on cur.plan_id = p.id and cur.revision = p.current_revision
  left join public.plan_revisions prev on prev.plan_id = p.id and prev.revision = p.current_revision - 1
  left join public.picks pick on pick.id = c.pick_id
  left join public.pick_options wo on wo.id = pick.winner_option_id
  left join public.experiences win on win.id = wo.experience_id
  left join public.groups grp on grp.id = pick.group_id
  left join public.profiles org on org.id = coalesce(p.organizer_id, pick.organizer_id)
  where c.sent_at is null
  order by c.created_at, c.id;
end $$;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;

-- Marks rows sent. Only rows still unsent change, so calling it twice is harmless. Returns how many changed.
create function public.mark_notifications_sent(ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.notification_log l set sent_at = now()
    where l.id = any (coalesce(mark_notifications_sent.ids, '{}')) and l.sent_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_notifications_sent(uuid[]) from public, anon, authenticated;

-- Expo said these tokens are not registered any more (app deleted, token rotated). Returns how many went.
create function public.remove_invalid_push_tokens(tokens text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.push_tokens t where t.token = any (coalesce(remove_invalid_push_tokens.tokens, '{}'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.remove_invalid_push_tokens(text[]) from public, anon, authenticated;

-- Wakes the sender. Runs every minute from cron and does nothing unless something is waiting. The Edge
-- Function URL and a shared secret live in Vault under `notify_url` and `notify_secret` (docs/notify-function.md);
-- without them, or without pg_net, this is a no-op, so local runs and the pgTAP runner are unaffected.
create function private.invoke_notify() returns void
language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return;
  end if;
  if not exists (select 1 from public.notification_log l
                 where l.sent_at is null and l.created_at > now() - interval '24 hours'
                   and (l.claimed_at is null or l.claimed_at < now() - interval '10 minutes')) then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'notify_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'notify_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $$;
revoke all on function private.invoke_notify() from public, anon, authenticated;

-- Every minute, like the pick reminder job. Skipped where pg_cron or pg_net isn't installed (local pgTAP runner).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('notify-send', '* * * * *', 'select private.invoke_notify()');
  else
    raise notice 'pg_cron or pg_net not available: notify-send not scheduled';
  end if;
end $$;
commit;
