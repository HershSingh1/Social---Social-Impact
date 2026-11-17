-- TEC-126 (decision R1, rule 3): retries never do anything extra.
-- 1. set_save(experience_id, group_id, saved) replaces toggle_save, which flipped back when a request was retried.
-- 2. create_pick requires client_key. Postgres allows no required parameter after one with a default, so
--    `starred` loses its default too: callers pass null for "no star".
begin;

-- Sets the viewer's own save in one place (group_id null is the personal list) to the wanted state.
-- Calling it again with the same values changes nothing and returns the same result.
create function public.set_save(experience_id uuid, group_id uuid, saved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  if set_save.saved is null then
    raise exception 'invalid_saved' using errcode = 'P0001';
  end if;
  if set_save.group_id is not null and not private.is_group_member(set_save.group_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if not set_save.saved then
    delete from public.saves s
      where s.experience_id = set_save.experience_id
        and s.user_id = uid
        and s.group_id is not distinct from set_save.group_id;
    return;
  end if;

  if exists (
    select 1 from public.saves s
      where s.experience_id = set_save.experience_id
        and s.user_id = uid
        and s.group_id is not distinct from set_save.group_id
  ) then
    return;
  end if;
  if not exists (
    select 1 from public.experiences e
      where e.id = set_save.experience_id and e.status = 'published'
  ) then
    raise exception 'experience_not_found' using errcode = 'P0001';
  end if;
  insert into public.saves (experience_id, user_id, group_id)
    values (set_save.experience_id, uid, set_save.group_id)
    on conflict do nothing;
end $$;
revoke all on function public.set_save(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_save(uuid, uuid, boolean) to authenticated;

drop function public.toggle_save(uuid, uuid);

-- Same body as 20261110000800_pick_functions.sql, with no defaults on starred and client_key and a
-- clear error when client_key is null.
drop function public.create_pick(uuid, jsonb, timestamptz, integer, uuid);
create function public.create_pick(group_id uuid, options jsonb, deadline timestamptz,
  starred integer, client_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; pid uuid; existing uuid; n integer; o jsonb; oid uuid; i integer := 0; starred_id uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if client_key is null then raise exception 'client_key_required' using errcode = 'P0001'; end if;
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
revoke all on function public.create_pick(uuid, jsonb, timestamptz, integer, uuid) from public, anon;
grant execute on function public.create_pick(uuid, jsonb, timestamptz, integer, uuid) to authenticated;

commit;
