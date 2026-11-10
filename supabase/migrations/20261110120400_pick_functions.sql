-- Group pick RPCs (P0-08, P0-09, P0-10).
-- Scoring: Yes = 2, Maybe = 1, No or no vote = 0. Order: score desc, No asc, starred first, position asc.

-- ---------------------------------------------------------------- internal: tally + voter status upkeep
create function private.refresh_option_tally(p_option uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.option_tallies t set
    yes   = (select count(*) from public.votes v where v.option_id = p_option and v.value = 'yes'),
    maybe = (select count(*) from public.votes v where v.option_id = p_option and v.value = 'maybe'),
    no    = (select count(*) from public.votes v where v.option_id = p_option and v.value = 'no')
  where t.option_id = p_option
$$;

-- complete = voted on every option of the pick
create function private.refresh_voter_status(p_pick uuid, p_user uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.pick_voter_status (pick_id, user_id, complete)
  values (
    p_pick, p_user,
    (select count(*) from public.votes v join public.pick_options o on o.id = v.option_id
      where o.pick_id = p_pick and v.user_id = p_user)
    = (select count(*) from public.pick_options where pick_id = p_pick))
  on conflict (pick_id, user_id) do update set complete = excluded.complete
$$;

-- ---------------------------------------------------------------- create_pick
-- p_options: JSON array of {"experience_id": uuid, "proposed_start": timestamptz|null}, 2 to 5 entries.
-- p_starred: 1-based position in p_options of the tie-break star (optional).
-- Retry-safe without a client key: if the caller's own open pick for this group already has exactly these
-- options, that pick's id is returned instead of an error.
create function public.create_pick(
  p_group_id uuid, p_options jsonb, p_deadline timestamptz, p_starred integer default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_n        int;
  v_pick     uuid;
  v_existing public.picks;
  v_opt_id   uuid;
  v_new_exp  uuid[];
  v_new_start timestamptz[];
  v_old_exp  uuid[];
  v_old_start timestamptz[];
  r          record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not private.is_account() then raise exception 'account_required'; end if;
  if not private.is_member(p_group_id) then raise exception 'not_member'; end if;

  if jsonb_typeof(p_options) is distinct from 'array' then raise exception 'invalid_options'; end if;
  v_n := jsonb_array_length(p_options);
  if v_n < 2 or v_n > 5 then raise exception 'invalid_option_count'; end if;
  if p_starred is not null and (p_starred < 1 or p_starred > v_n) then raise exception 'invalid_star'; end if;
  -- 1 hour to 7 days from now, with one minute of slack for client/server clock and network delay
  if p_deadline is null
     or p_deadline < now() + interval '59 minutes'
     or p_deadline > now() + interval '7 days 1 minute' then
    raise exception 'invalid_deadline';
  end if;

  select array_agg((e ->> 'experience_id')::uuid order by ord),
         array_agg(nullif(e ->> 'proposed_start', '')::timestamptz order by ord)
    into v_new_exp, v_new_start
    from jsonb_array_elements(p_options) with ordinality as t(e, ord);

  if exists (select 1 from unnest(v_new_exp) x
              where not exists (select 1 from public.experiences where id = x and status = 'active')) then
    raise exception 'experience_unavailable';
  end if;

  select * into v_existing from public.picks where group_id = p_group_id and state = 'open';
  if found then
    select array_agg(experience_id order by position), array_agg(proposed_start order by position)
      into v_old_exp, v_old_start from public.pick_options where pick_id = v_existing.id;
    if v_existing.organizer_id = v_uid and v_old_exp = v_new_exp and v_old_start is not distinct from v_new_start then
      return v_existing.id;
    end if;
    raise exception 'open_pick_exists' using detail = v_existing.id::text;
  end if;

  begin
    insert into public.picks (group_id, organizer_id, deadline) values (p_group_id, v_uid, p_deadline)
    returning id into v_pick;
  exception when unique_violation then
    raise exception 'open_pick_exists';
  end;

  for r in select e, ord from jsonb_array_elements(p_options) with ordinality as t(e, ord) loop
    insert into public.pick_options (pick_id, experience_id, proposed_start, position)
    values (v_pick, (r.e ->> 'experience_id')::uuid, nullif(r.e ->> 'proposed_start', '')::timestamptz, r.ord)
    returning id into v_opt_id;
    insert into public.option_tallies (option_id, pick_id) values (v_opt_id, v_pick);
    if p_starred is not null and r.ord = p_starred then
      update public.picks set starred_option_id = v_opt_id where id = v_pick;
    end if;
  end loop;

  return v_pick;
end $$;

-- ---------------------------------------------------------------- add_option (organizer, while open)
create function public.add_option(
  p_pick_id uuid, p_experience_id uuid, p_proposed_start timestamptz default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_pick public.picks;
  v_opt  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_pick from public.picks where id = p_pick_id for update;
  if not found or not private.is_member(v_pick.group_id) then raise exception 'pick_not_found'; end if;
  if v_pick.organizer_id <> v_uid then raise exception 'not_organizer'; end if;
  if v_pick.state <> 'open' or v_pick.deadline <= now() then raise exception 'voting_closed'; end if;
  if (select count(*) from public.pick_options where pick_id = p_pick_id) >= 5 then
    raise exception 'too_many_options';
  end if;
  if not exists (select 1 from public.experiences where id = p_experience_id and status = 'active') then
    raise exception 'experience_unavailable';
  end if;

  insert into public.pick_options (pick_id, experience_id, proposed_start, position)
  values (p_pick_id, p_experience_id, p_proposed_start,
          (select coalesce(max(position), 0) + 1 from public.pick_options where pick_id = p_pick_id))
  returning id into v_opt;
  insert into public.option_tallies (option_id, pick_id) values (v_opt, p_pick_id);
  -- everyone has a new option to vote on, so nobody counts as fully voted any more
  update public.pick_voter_status set complete = false where pick_id = p_pick_id;
  return v_opt;
end $$;

-- ---------------------------------------------------------------- cast_vote
-- p_value: 'yes' | 'maybe' | 'no', or NULL to clear the caller's vote. Guests can vote.
create function public.cast_vote(p_option_id uuid, p_value text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_pick_id uuid;
  v_pick    public.picks;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_value is not null and p_value not in ('yes', 'maybe', 'no') then raise exception 'invalid_value'; end if;

  select pick_id into v_pick_id from public.pick_options where id = p_option_id;
  if v_pick_id is null then raise exception 'option_not_found'; end if;
  -- share-lock the pick so a concurrent close_pick (FOR UPDATE) waits for in-flight votes
  select * into v_pick from public.picks where id = v_pick_id for share;
  if not private.is_member(v_pick.group_id) then raise exception 'not_member'; end if;
  if v_pick.state <> 'open' or v_pick.deadline <= now() then raise exception 'voting_closed'; end if;

  -- serialize concurrent votes on the same option so the recounted tally is never stale
  perform 1 from public.option_tallies where option_id = p_option_id for update;
  if p_value is null then
    delete from public.votes where option_id = p_option_id and user_id = v_uid;
  else
    insert into public.votes (option_id, user_id, value) values (p_option_id, v_uid, p_value)
    on conflict (option_id, user_id) do update set value = excluded.value;
  end if;
  perform private.refresh_option_tally(p_option_id);
  perform private.refresh_voter_status(v_pick_id, v_uid);
end $$;

-- ---------------------------------------------------------------- closing (internal, runs once)
create function private.close_pick_row(p_pick uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pick public.picks;
  v_rank jsonb;
  a_id uuid; a_name text; a_score int; a_no int; b_score int; b_no int;
  v_org text;
  v_sentence text;
begin
  select * into v_pick from public.picks where id = p_pick for update;
  if not found or v_pick.state <> 'open' then return; end if;   -- closing happens once

  if not exists (select 1 from public.votes v join public.pick_options o on o.id = v.option_id
                  where o.pick_id = p_pick) then
    update public.picks set state = 'closed', winner_option_id = null,
      tie_rule = 'No votes were cast. The organizer chooses an option.' where id = p_pick;
    return;
  end if;

  select jsonb_agg(to_jsonb(s) order by s.rn) into v_rank
  from (
    select o.id, e.name,
           coalesce(sum(case v.value when 'yes' then 2 when 'maybe' then 1 else 0 end), 0)::int as score,
           count(*) filter (where v.value = 'no')::int as no_votes,
           row_number() over (
             order by coalesce(sum(case v.value when 'yes' then 2 when 'maybe' then 1 else 0 end), 0) desc,
                      count(*) filter (where v.value = 'no') asc,
                      (o.id = v_pick.starred_option_id) desc,
                      o.position asc) as rn
    from public.pick_options o
    join public.experiences e on e.id = o.experience_id
    left join public.votes v on v.option_id = o.id
    where o.pick_id = p_pick
    group by o.id, o.position, e.name) s;

  a_id := (v_rank -> 0 ->> 'id')::uuid;
  a_name := v_rank -> 0 ->> 'name';
  a_score := (v_rank -> 0 ->> 'score')::int;
  a_no := (v_rank -> 0 ->> 'no_votes')::int;
  b_score := (v_rank -> 1 ->> 'score')::int;
  b_no := (v_rank -> 1 ->> 'no_votes')::int;
  select p.display_name into v_org from public.profiles p where p.id = v_pick.organizer_id;

  if a_score > b_score then
    v_sentence := format('%s has the highest score: %s points to %s.', a_name, a_score, b_score);
  elsif a_no < b_no then
    v_sentence := format('Tied at %s points. %s wins with fewer No votes (%s vs %s).',
                         a_score, a_name, a_no, b_no);
  elsif a_id = v_pick.starred_option_id then
    v_sentence := format('Tied on points (%s) and No votes (%s). %s was %s''s starred option.',
                         a_score, a_no, a_name, v_org);
  else
    v_sentence := format('Tied on points (%s) and No votes (%s), and no star decided it. %s was added first.',
                         a_score, a_no, a_name);
  end if;

  update public.picks set state = 'closed', winner_option_id = a_id, tie_rule = v_sentence where id = p_pick;
end $$;

-- Organizer taps "Close now". Idempotent: closing an already closed pick just returns its result.
create function public.close_pick(p_pick_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_pick public.picks;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_pick from public.picks where id = p_pick_id;
  if not found or not private.is_member(v_pick.group_id) then raise exception 'pick_not_found'; end if;
  if v_pick.organizer_id <> v_uid then raise exception 'not_organizer'; end if;
  if v_pick.state in ('planned', 'cancelled') then raise exception 'pick_not_open'; end if;

  perform private.close_pick_row(p_pick_id);
  select * into v_pick from public.picks where id = p_pick_id;
  return jsonb_build_object('state', v_pick.state, 'winner_option_id', v_pick.winner_option_id,
                            'tie_rule', v_pick.tie_rule);
end $$;

-- pg_cron, every minute: close every pick whose deadline has passed. Server only.
create function public.close_due_picks()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from public.picks where state = 'open' and deadline <= now()
           order by deadline for update skip locked loop
    perform private.close_pick_row(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- cancel_pick (helper, P0-09 Cancel)
create function public.cancel_pick(p_pick_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_pick public.picks;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_pick from public.picks where id = p_pick_id for update;
  if not found or not private.is_member(v_pick.group_id) then raise exception 'pick_not_found'; end if;
  if v_pick.organizer_id <> v_uid then raise exception 'not_organizer'; end if;
  if v_pick.state not in ('open', 'closed') then raise exception 'pick_not_cancellable'; end if;
  update public.picks set state = 'cancelled' where id = p_pick_id;
end $$;

-- ---------------------------------------------------------------- override_pick (helper)
-- Organizer chooses an option on a closed pick: needed when nobody voted (P0-09); also the P0-10 override.
-- p_option_id NULL clears the override.
create function public.override_pick(p_pick_id uuid, p_option_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_pick public.picks;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_pick from public.picks where id = p_pick_id for update;
  if not found or not private.is_member(v_pick.group_id) then raise exception 'pick_not_found'; end if;
  if v_pick.organizer_id <> v_uid then raise exception 'not_organizer'; end if;
  if v_pick.state <> 'closed' then raise exception 'pick_not_closed'; end if;
  if p_option_id is not null
     and not exists (select 1 from public.pick_options where id = p_option_id and pick_id = p_pick_id) then
    raise exception 'option_not_found';
  end if;
  update public.picks set override_option_id = p_option_id where id = p_pick_id;
end $$;
