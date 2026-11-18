-- TEC-143 (P2-04 backend, decision N9): a repeat rule on a plan and a "time to plan again" reminder.
-- Nothing is created or sent here (C2: drafts live on the phone). Seven days before the next repeat date a cron
-- job writes one notification_log row for the organizer; the sender (TEC-142) delivers it and tapping it builds
-- the draft on the phone. Rows hold ids and a kind only (rule 8).
begin;

-- Adds the eighth kind. The check on notification_log and set_notification_pref read this function, so
-- replacing it is enough; the seven existing kinds are unchanged.
create or replace function private.notification_kinds() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'plan_sent', 'pick_opened', 'pick_closing', 'pick_result',
    'material_change', 'cancellation', 'organizer_nudge', 'plan_again'
  ]
$$;

alter table public.plans add column repeat_rule text
  check (repeat_rule in ('weekly', 'every_2_weeks', 'monthly'));
create index plans_repeating on public.plans(id) where repeat_rule is not null;

-- The date a repeating plan comes round again: one step after the plan's current start, counted on the
-- America/Chicago wall clock so the time of day holds across a DST change. A month step from the 31st lands on
-- the last day of a shorter month.
create function private.next_repeat_at(start_at timestamptz, rule text) returns timestamptz
language sql stable set search_path = '' as $$
  select case rule
    when 'weekly' then ((start_at at time zone 'America/Chicago') + interval '7 days') at time zone 'America/Chicago'
    when 'every_2_weeks' then ((start_at at time zone 'America/Chicago') + interval '14 days') at time zone 'America/Chicago'
    when 'monthly' then ((start_at at time zone 'America/Chicago') + interval '1 month') at time zone 'America/Chicago'
  end
$$;
revoke all on function private.next_repeat_at(timestamptz, text) from public, anon, authenticated;

-- Organizer sets or clears the repeat rule. A null rule clears it. A cancelled plan cannot repeat. A change
-- of rule moves the next date, so a reminder that has not gone out yet is dropped and the job writes the right
-- one when its day comes. The plan row lock serialises two taps.
create function public.set_repeat(plan_id uuid, rule text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.plans;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  select * into p from public.plans pl where pl.id = set_repeat.plan_id for update;
  if not found or p.organizer_id <> uid then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if set_repeat.rule is not null and set_repeat.rule <> all (array['weekly', 'every_2_weeks', 'monthly']) then
    raise exception 'invalid_repeat_rule' using errcode = 'P0001';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  if p.repeat_rule is not distinct from set_repeat.rule then return; end if;

  update public.plans pl set repeat_rule = set_repeat.rule, updated_at = now() where pl.id = p.id;
  delete from public.notification_log l
    where l.plan_id = p.id and l.kind = 'plan_again' and l.sent_at is null;
end $$;
revoke all on function public.set_repeat(uuid, text) from public, anon;
grant execute on function public.set_repeat(uuid, text) to authenticated;

-- A cancelled plan does not repeat; a reminder that has not gone out yet is moot.
create function private.drop_plan_again_on_cancel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state = 'cancelled' and old.state <> 'cancelled' then
    delete from public.notification_log l
      where l.plan_id = new.id and l.kind = 'plan_again' and l.sent_at is null;
  end if;
  return new;
end $$;
revoke all on function private.drop_plan_again_on_cancel() from public, anon, authenticated;
create trigger drop_plan_again_on_cancel after update of state on public.plans
  for each row execute function private.drop_plan_again_on_cancel();

-- Cron job: "time to plan again" for the organizer of a sent, repeating plan, from 7 days before the next
-- repeat date until that date. The event key names the plan and the date, so the reminder is a one-time thing
-- however often the job runs, and a changed rule or time is a new date. A plan whose next date has already
-- passed gets nothing. Returns how many rows it wrote. Cron role only; clients get no execute grant.
create function public.notify_plan_again() returns integer
language plpgsql security definer set search_path = '' as $$
declare p record; n integer := 0;
begin
  for p in
    select pl.id, pl.organizer_id,
      private.next_repeat_at(v.start_at, pl.repeat_rule) as next_at
    from public.plans pl
    join public.plan_revisions v on v.plan_id = pl.id and v.revision = pl.current_revision
    where pl.state = 'sent' and pl.repeat_rule is not null
  loop
    if now() < p.next_at
       and now() >= ((p.next_at at time zone 'America/Chicago') - interval '7 days') at time zone 'America/Chicago' then
      n := n + cardinality(private.write_notifications(
        'plan_again:' || p.id || ':' || to_char(p.next_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
        'plan_again', array[p.organizer_id], p.id, null));
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.notify_plan_again() from public, anon, authenticated;

-- Hourly: a 7-day reminder does not need a tighter window. Skipped where pg_cron isn't installed (local pgTAP
-- runner); enable it on Supabase.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('notify-plan-again', '0 * * * *', 'select public.notify_plan_again()');
  else
    raise notice 'pg_cron not available: notify-plan-again not scheduled';
  end if;
end $$;
commit;
