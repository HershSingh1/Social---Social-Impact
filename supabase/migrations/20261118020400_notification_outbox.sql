-- TEC-137 (P1-04 backend 2 of 3, decision N4): the notification outbox, one-hour pick reminders and nudge.
-- Nothing is sent here. Every decision about who is told what is one row in notification_log, written by
-- triggers and one cron job; the sender (3 of 3) works through rows where sent_at is null.
-- Rows hold ids and a kind only: no names, notes, times or prices (rule 8). The sender looks the text up.
begin;

-- One row per (event, person), so an event can never notify the same person twice. No client access:
-- RLS is on with no policy and every grant is revoked. The sender uses the service role.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (length(event_key) between 1 and 200),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind = any (private.notification_kinds())),
  plan_id uuid references public.plans(id) on delete cascade,
  pick_id uuid references public.picks(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_log_event_user unique (event_key, user_id)
);
create index notification_log_unsent on public.notification_log(created_at) where sent_at is null;
create index notification_log_plan on public.notification_log(plan_id, user_id, kind, created_at) where plan_id is not null;
create index notification_log_pick on public.notification_log(pick_id, user_id, kind) where pick_id is not null;

alter table public.notification_log enable row level security;
revoke all on table public.notification_log from public, anon, authenticated;

-- The one place that writes the outbox. Skips anyone who turned this kind off (a missing pref row means on)
-- and anyone already holding a row for this event. Returns the people who got a new row.
create function private.write_notifications(event text, notif_kind text, who uuid[], for_plan uuid, for_pick uuid)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare written uuid[];
begin
  with ins as (
    insert into public.notification_log (event_key, user_id, kind, plan_id, pick_id)
      select event, u, notif_kind, for_plan, for_pick
      from (select distinct x as u from unnest(who) x where x is not null) w
      where not exists (select 1 from public.notification_prefs np
                        where np.user_id = w.u and np.kind = notif_kind and not np.enabled)
      on conflict on constraint notification_log_event_user do nothing
      returning user_id
  )
  select coalesce(array_agg(i.user_id order by i.user_id), '{}') into written from ins i;
  return written;
end $$;
revoke all on function private.write_notifications(text, text, uuid[], uuid, uuid) from public, anon, authenticated;

-- Plan sent to you. Fires when an invitee row is added to a sent plan (send_plan, add_invitees). A person who
-- added themselves through a plan link was not invited, so they are skipped. The organizer is never told.
create function private.notify_plan_invitee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.plans;
begin
  if new.status <> 'awaiting' or new.removed_at is not null or new.user_id is not distinct from (select auth.uid()) then
    return new;
  end if;
  select * into p from public.plans pl where pl.id = new.plan_id;
  if found and p.state = 'sent' and p.organizer_id <> new.user_id then
    perform private.write_notifications('plan_sent:' || p.id, 'plan_sent', array[new.user_id], p.id, null);
  end if;
  return new;
end $$;
revoke all on function private.notify_plan_invitee() from public, anon, authenticated;
create trigger notify_plan_invitee after insert on public.rsvps
  for each row execute function private.notify_plan_invitee();

-- A draft that becomes Sent invites everyone already on it.
create function private.notify_plan_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.state = 'draft' and new.state = 'sent' then
    perform private.write_notifications('plan_sent:' || new.id, 'plan_sent',
      (select array_agg(r.user_id) from public.rsvps r
        where r.plan_id = new.id and r.removed_at is null and r.status = 'awaiting' and r.user_id <> new.organizer_id),
      new.id, null);
  elsif old.state = 'sent' and new.state = 'cancelled' then
    -- Cancellation: everyone invited except the organizer, whatever they answered.
    perform private.write_notifications('cancellation:' || new.id, 'cancellation',
      (select array_agg(r.user_id) from public.rsvps r
        where r.plan_id = new.id and r.removed_at is null and r.user_id <> new.organizer_id),
      new.id, null);
    -- A change prompt or nudge that has not gone out yet is moot once the plan is cancelled.
    delete from public.notification_log l
      where l.plan_id = new.id and l.sent_at is null and l.kind in ('material_change', 'organizer_nudge');
  end if;
  return new;
end $$;
revoke all on function private.notify_plan_state() from public, anon, authenticated;
create trigger notify_plan_state after update of state on public.plans
  for each row execute function private.notify_plan_state();

-- Material change. edit_plan and the listing-change job both move Going invitees to needs_reconfirm after
-- bumping the revision, so those rows are exactly "Going invitees" at the moment of the change. The event
-- is per revision: the same revision never notifies twice, a later one can.
create function private.notify_material_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.plans;
begin
  if old.status = 'going' and new.status = 'needs_reconfirm' and new.removed_at is null then
    select * into p from public.plans pl where pl.id = new.plan_id;
    if found and p.state = 'sent' and p.organizer_id <> new.user_id then
      perform private.write_notifications('material_change:' || p.id || ':' || p.current_revision,
        'material_change', array[new.user_id], p.id, null);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.notify_material_change() from public, anon, authenticated;
create trigger notify_material_change after update of status on public.rsvps
  for each row execute function private.notify_material_change();

-- Pick opened: every current member except the organizer.
create function private.notify_pick_opened() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state = 'open' then
    perform private.write_notifications('pick_opened:' || new.id, 'pick_opened',
      (select array_agg(m.user_id) from public.group_members m
        where m.group_id = new.group_id and m.removed_at is null and not m.blocked and m.user_id <> new.organizer_id),
      null, new.id);
  end if;
  return new;
end $$;
revoke all on function private.notify_pick_opened() from public, anon, authenticated;
create trigger notify_pick_opened after insert on public.picks
  for each row execute function private.notify_pick_opened();

-- Pick result: every current member, once the pick closes with a winner. A pick nobody voted on closes
-- without a winner and the organizer chooses, so there is no result to announce. Changing the organizer's
-- override later does not announce again. Whatever closes or cancels a pick also drops its unsent reminders.
create function private.notify_pick_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.state = 'open' and new.state <> 'open' then
    delete from public.notification_log l
      where l.pick_id = new.id and l.sent_at is null and l.kind = 'pick_closing';
    if new.state = 'closed' and new.winner_option_id is not null then
      perform private.write_notifications('pick_result:' || new.id, 'pick_result',
        (select array_agg(m.user_id) from public.group_members m
          where m.group_id = new.group_id and m.removed_at is null and not m.blocked),
        null, new.id);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.notify_pick_state() from public, anon, authenticated;
create trigger notify_pick_state after update of state on public.picks
  for each row execute function private.notify_pick_state();

-- Someone who has voted on every option no longer needs the one-hour reminder, if it has not gone out yet.
create function private.drop_answered_reminder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.complete then
    delete from public.notification_log l
      where l.pick_id = new.pick_id and l.user_id = new.user_id and l.sent_at is null and l.kind = 'pick_closing';
  end if;
  return new;
end $$;
revoke all on function private.drop_answered_reminder() from public, anon, authenticated;
create trigger drop_answered_reminder after insert or update of complete on public.pick_voter_status
  for each row execute function private.drop_answered_reminder();

-- Cron job: "pick closes in 1 hour" for members who have not voted on every option (a member who joined
-- mid-pick has no status row yet, which counts as not voted). Runs every minute, so the window opens within
-- a minute of the hour mark; the event key makes each pick's reminder a one-time thing. Returns how many
-- rows it wrote. Cron role only; clients get no execute grant.
create function public.notify_closing_picks() returns integer
language plpgsql security definer set search_path = '' as $$
declare p record; n integer := 0;
begin
  for p in select pk.id, pk.group_id from public.picks pk
    where pk.state = 'open' and pk.deadline > now() and pk.deadline <= now() + interval '1 hour' loop
    n := n + cardinality(private.write_notifications('pick_closing:' || p.id, 'pick_closing',
      (select array_agg(m.user_id) from public.group_members m
        where m.group_id = p.group_id and m.removed_at is null and not m.blocked
          and not exists (select 1 from public.pick_voter_status s
                          where s.pick_id = p.id and s.user_id = m.user_id and s.complete)),
      null, p.id));
  end loop;
  return n;
end $$;
revoke all on function public.notify_closing_picks() from public, anon, authenticated;

-- The organizer nudges invitees still Awaiting reply. Each person at most once per 24 hours per plan. Anyone
-- who is not an invitee, is not Awaiting, was nudged in the last 24 hours or turned this kind off is left out;
-- the call returns who was nudged. The plan row lock serialises a double tap, so the 24-hour check cannot be
-- raced past.
create function public.nudge(plan_id uuid, user_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.plans;
  starts timestamptz;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if user_ids is null then raise exception 'invalid_user_ids' using errcode = 'P0001'; end if;
  select * into p from public.plans pl where pl.id = nudge.plan_id for update;
  if not found or p.state = 'draft' or p.organizer_id <> uid then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select v.start_at into starts from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if starts <= now() then raise exception 'plan_started' using errcode = 'P0001'; end if;

  return private.write_notifications('nudge:' || p.id || ':' || gen_random_uuid(), 'organizer_nudge',
    (select array_agg(r.user_id) from public.rsvps r
      where r.plan_id = p.id and r.user_id = any (nudge.user_ids) and r.user_id <> p.organizer_id
        and r.removed_at is null and r.status = 'awaiting'
        and not exists (select 1 from public.notification_log l
                        where l.plan_id = p.id and l.user_id = r.user_id and l.kind = 'organizer_nudge'
                          and l.created_at > now() - interval '24 hours')),
    p.id, null);
end $$;
revoke all on function public.nudge(uuid, uuid[]) from public, anon;
grant execute on function public.nudge(uuid, uuid[]) to authenticated;

-- Every minute. Skipped where pg_cron isn't installed (local pgTAP runner); enable it on Supabase.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('notify-closing-picks', '* * * * *', 'select public.notify_closing_picks()');
  else
    raise notice 'pg_cron not available: notify-closing-picks not scheduled';
  end if;
end $$;
commit;
