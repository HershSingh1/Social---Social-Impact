-- TEC-30 (P0-09 backend): close_pick, close_due_picks (cron) and cancel_pick.
-- Scores from `votes` (the source of truth), so it does not depend on cast_vote keeping tallies.
begin;

-- Closes one open pick. No auth check: callers are close_pick (organizer) and close_due_picks (cron).
-- Locks the row, so concurrent closes run once; anything not open is left untouched.
-- Scoring: yes 2, maybe 1, no/no vote 0. Order: score desc, No asc, starred first, position asc.
create function private.close_pick_now(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.picks;
  w record;                   -- winner (rank 1) next to the runner-up (rank 2)
  rule text;
begin
  select * into p from public.picks where id = target and state = 'open' for update;
  if not found then return; end if;

  with s as (
    select o.id, e.name, o.position, o.id = p.starred_option_id as starred,
      coalesce(sum(case v.value when 'yes' then 2 when 'maybe' then 1 else 0 end), 0)::int as score,
      count(*) filter (where v.value = 'no')::int as no_votes, count(v.user_id)::int as voted
    from public.pick_options o
    join public.experiences e on e.id = o.experience_id
    left join public.votes v on v.option_id = o.id
    where o.pick_id = p.id
    group by o.id, e.name, o.position
  ), r as (
    select *, row_number() over (order by score desc, no_votes, starred desc, position) as rn,
      sum(voted) over () as total_votes
    from s
  )
  select a.id, a.name, a.score, a.no_votes, a.starred, a.total_votes,
    b.score as rival_score, b.no_votes as rival_no
  into w from r a left join r b on b.rn = 2 where a.rn = 1;

  if w.id is null or w.total_votes = 0 then
    update public.picks set state = 'closed', closed_at = now(), winner_option_id = null,
      tie_rule = 'Nobody voted. The organizer chooses an option.' where id = p.id;
    return;
  end if;

  if w.rival_score is distinct from w.score then
    rule := format('%s wins with the most points (%s).', w.name, w.score);
  elsif w.no_votes < w.rival_no then
    rule := format('Tied at %s points. %s wins with fewer No votes (%s vs %s).', w.score, w.name, w.no_votes, w.rival_no);
  elsif w.starred then
    rule := format('Tied at %s points and %s No votes. %s wins as the starred option.', w.score, w.no_votes, w.name);
  else
    rule := format('Tied on points, No votes and star. %s wins because it was added first.', w.name);
  end if;

  update public.picks set state = 'closed', closed_at = now(), winner_option_id = w.id, tie_rule = rule
    where id = p.id;
end $$;
revoke all on function private.close_pick_now(uuid) from public, anon, authenticated;

-- Organizer taps Close now. Closing twice changes nothing; a cancelled pick can't be closed.
create function public.close_pick(pick_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; p public.picks;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  select * into p from public.picks where id = close_pick.pick_id;
  if not found or p.organizer_id <> uid then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then
    raise exception 'pick_cancelled' using errcode = 'P0001';
  end if;
  perform private.close_pick_now(p.id); -- no-op unless open
end $$;
revoke all on function public.close_pick(uuid) from public, anon;
grant execute on function public.close_pick(uuid) to authenticated;

-- Deadline job. Runs as the privileged cron role only; clients get no execute grant.
create function public.close_due_picks() returns integer
language plpgsql security definer set search_path = '' as $$
declare t uuid; n integer := 0;
begin
  for t in select id from public.picks where state = 'open' and deadline <= now() order by deadline loop
    perform private.close_pick_now(t);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.close_due_picks() from public, anon, authenticated;

-- Organizer cancels an open or closed pick. Cancelled stays cancelled; planned can't be cancelled.
create function public.cancel_pick(pick_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; p public.picks;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  select * into p from public.picks where id = cancel_pick.pick_id for update;
  if not found or p.organizer_id <> uid then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then return; end if;
  if p.state not in ('open', 'closed') then
    raise exception 'pick_not_cancellable' using errcode = 'P0001';
  end if;
  update public.picks set state = 'cancelled' where id = p.id;
end $$;
revoke all on function public.cancel_pick(uuid) from public, anon;
grant execute on function public.cancel_pick(uuid) to authenticated;

-- Every minute. Skipped where pg_cron isn't installed (local pgTAP runner); enable it on Supabase.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('close-due-picks', '* * * * *', 'select public.close_due_picks()');
  else
    raise notice 'pg_cron not available: close-due-picks not scheduled';
  end if;
end $$;
commit;
