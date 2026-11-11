-- TEC-29 (P0-08 backend): create_pick, add_option, cast_vote. Tallies and voter status are
-- maintained in the same transaction (C1: raw votes are owner-readable only).
begin;

-- options: jsonb array of {"experience_id": uuid, "proposed_start": timestamptz|null}.
-- starred: 1-based position in options, or null. Retrying with the same client_key returns the same pick.
-- open_pick_exists carries the open pick's id in the error DETAIL.
create function public.create_pick(group_id uuid, options jsonb, deadline timestamptz,
  starred integer default null, client_key uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; pid uuid; existing uuid; n integer; o jsonb; oid uuid; i integer := 0; starred_id uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  select p.id into existing from public.picks p where p.client_key = create_pick.client_key and p.organizer_id = uid;
  if existing is not null then return existing; end if;
  if not private.is_group_member(group_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if exists (select 1 from public.groups g where g.id = group_id and g.archived_at is not null) then
    raise exception 'group_archived' using errcode = 'P0001';
  end if;
  if options is null or jsonb_typeof(options) <> 'array' then raise exception 'invalid_options' using errcode = 'P0001'; end if;
  n := jsonb_array_length(options);
  if n not between 2 and 5 then raise exception 'invalid_option_count' using errcode = 'P0001'; end if;
  if starred is not null and starred not between 1 and n then raise exception 'invalid_starred' using errcode = 'P0001'; end if;
  -- 1 h to 7 days, with a minute of slack for clock drift
  if deadline is null or deadline < now() + interval '59 minutes' or deadline > now() + interval '7 days 1 minute' then
    raise exception 'invalid_deadline' using errcode = 'P0001';
  end if;
  -- Serialise starts per group so the one_open_pick index never surfaces as a raw error.
  perform 1 from public.groups g where g.id = create_pick.group_id for update;
  select p.id into existing from public.picks p where p.group_id = create_pick.group_id and p.state = 'open';
  if existing is not null then
    raise exception 'open_pick_exists' using errcode = 'P0001', detail = existing::text;
  end if;
  insert into public.picks (group_id, organizer_id, client_key, deadline)
    values (group_id, uid, client_key, deadline) returning id into pid;
  for o in select * from jsonb_array_elements(options) loop
    i := i + 1;
    if not exists (select 1 from public.experiences e where e.id = (o ->> 'experience_id')::uuid and e.status = 'published') then
      raise exception 'experience_not_found' using errcode = 'P0001';
    end if;
    insert into public.pick_options (pick_id, experience_id, proposed_start, position)
      values (pid, (o ->> 'experience_id')::uuid, (o ->> 'proposed_start')::timestamptz, i) returning id into oid;
    insert into public.option_tallies (option_id) values (oid);
    if i = starred then starred_id := oid; end if;
  end loop;
  if starred_id is not null then update public.picks set starred_option_id = starred_id where id = pid; end if;
  insert into public.pick_voter_status (pick_id, user_id)
    select pid, m.user_id from public.group_members m
    where m.group_id = create_pick.group_id and m.removed_at is null and not m.blocked;
  return pid;
end $$;

-- Organizer only. Retrying the same (experience, start) returns the existing option.
create function public.add_option(pick_id uuid, experience_id uuid, proposed_start timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid; pk public.picks; oid uuid; n integer;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  select * into pk from public.picks p where p.id = add_option.pick_id for update;
  if not found or not private.is_group_member(pk.group_id) then raise exception 'pick_not_found' using errcode = 'P0001'; end if;
  if pk.organizer_id <> uid then raise exception 'not_organizer' using errcode = '42501'; end if;
  if pk.state <> 'open' or pk.deadline <= now() then raise exception 'voting_closed' using errcode = 'P0001'; end if;
  select o.id into oid from public.pick_options o where o.pick_id = pk.id and o.experience_id = add_option.experience_id
    and o.proposed_start is not distinct from add_option.proposed_start;
  if oid is not null then return oid; end if;
  if not exists (select 1 from public.experiences e where e.id = add_option.experience_id and e.status = 'published') then
    raise exception 'experience_not_found' using errcode = 'P0001';
  end if;
  select count(*) into n from public.pick_options o where o.pick_id = pk.id;
  if n >= 5 then raise exception 'too_many_options' using errcode = 'P0001'; end if;
  insert into public.pick_options (pick_id, experience_id, proposed_start, position)
    values (pk.id, add_option.experience_id, add_option.proposed_start, n + 1) returning id into oid;
  insert into public.option_tallies (option_id) values (oid);
  -- Everyone now has an option they have not voted on.
  update public.pick_voter_status s set complete = false where s.pick_id = pk.id;
  return oid;
end $$;

-- value: 'yes' | 'maybe' | 'no'; null clears. Repeating a vote is a no-op (idempotent upsert).
create function public.cast_vote(option_id uuid, value text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; pk public.picks; pid uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if value is not null and value not in ('yes', 'maybe', 'no') then raise exception 'invalid_vote' using errcode = 'P0001'; end if;
  select o.pick_id into pid from public.pick_options o where o.id = cast_vote.option_id;
  if pid is null then raise exception 'option_not_found' using errcode = 'P0001'; end if;
  -- The pick row lock serialises votes on a pick, so the recounts below are always current.
  select * into pk from public.picks p where p.id = pid for update;
  if not private.is_group_member(pk.group_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if pk.state <> 'open' or pk.deadline <= now() then raise exception 'voting_closed' using errcode = 'P0001'; end if;
  if value is null then
    delete from public.votes v where v.option_id = cast_vote.option_id and v.user_id = uid;
  else
    insert into public.votes (option_id, user_id, value) values (cast_vote.option_id, uid, value)
      on conflict on constraint votes_pkey do update set value = excluded.value;
  end if;
  update public.option_tallies t set
    yes = (select count(*) from public.votes v where v.option_id = t.option_id and v.value = 'yes'),
    maybe = (select count(*) from public.votes v where v.option_id = t.option_id and v.value = 'maybe'),
    no = (select count(*) from public.votes v where v.option_id = t.option_id and v.value = 'no')
  where t.option_id = cast_vote.option_id;
  -- Complete = voted on every option. Members who joined mid-pick get their row here, incomplete until then.
  insert into public.pick_voter_status (pick_id, user_id, complete) values (pid, uid,
    (select count(*) from public.votes v join public.pick_options o on o.id = v.option_id
       where o.pick_id = pid and v.user_id = uid) = (select count(*) from public.pick_options o where o.pick_id = pid))
  on conflict (pick_id, user_id) do update set complete = excluded.complete;
end $$;

revoke all on function public.create_pick(uuid, jsonb, timestamptz, integer, uuid),
  public.add_option(uuid, uuid, timestamptz), public.cast_vote(uuid, text) from public, anon;
grant execute on function public.create_pick(uuid, jsonb, timestamptz, integer, uuid),
  public.add_option(uuid, uuid, timestamptz), public.cast_vote(uuid, text) to authenticated;
commit;
