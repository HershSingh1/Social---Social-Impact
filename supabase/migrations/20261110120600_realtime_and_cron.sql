-- Realtime: tables the app subscribes to. Realtime applies RLS, so a client only receives rows it may read.
-- (The spec names votes and rsvps; votes are private per user, so tallies come from option_tallies.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.group_members, public.picks, public.pick_options,
      public.option_tallies, public.pick_voter_status,
      public.plans, public.plan_revisions, public.rsvps;
  end if;
end $$;

-- pg_cron: close due picks every minute (P0-09). Skipped where pg_cron is not installed (plain-Postgres tests);
-- on a hosted project enable the pg_cron extension in the dashboard first if this migration cannot create it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('close-due-picks', '* * * * *', 'select public.close_due_picks()');
  else
    raise notice 'pg_cron not available: close_due_picks() is NOT scheduled';
  end if;
end $$;
