-- TEC-129 (P1-01 backend, decisions N1, N2, C1): Free or Busy per time option, counts only.
-- 1. availability: one private row per person per option. Readable only by its owner; written only through set_availability.
-- 2. availability_tallies: (free, busy) per option, kept by a trigger. This is all members read, and what Realtime publishes.
-- 3. picks.availability_enabled and an optional last parameter on create_pick.
-- close_pick_now and the tie-breaker read votes only; nothing here touches them.
begin;

create table public.availability (
  option_id uuid not null references public.pick_options(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('free', 'busy')),
  source text not null default 'manual' check (source in ('manual', 'calendar')),
  updated_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index availability_user on public.availability(user_id);

create table public.availability_tallies (
  option_id uuid primary key references public.pick_options(id),
  free integer not null default 0 check (free >= 0),
  busy integer not null default 0 check (busy >= 0)
);

alter table public.availability enable row level security;
alter table public.availability_tallies enable row level security;
revoke all on table public.availability, public.availability_tallies from public, anon, authenticated;
grant select on table public.availability, public.availability_tallies to authenticated;

-- Nobody but the owner can read who is free or busy (N1).
create policy own_availability on public.availability for select to authenticated
  using (user_id = (select auth.uid()));
-- Same rule as option_tallies: visible when the option's pick is visible, which means group members.
create policy member_availability_tallies on public.availability_tallies for select to authenticated
  using (exists (select 1 from public.pick_options o where o.id = option_id));

alter publication supabase_realtime add table public.availability_tallies;

-- Every option gets a 0/0 tally row, so a screen never has to tell "no row" from "nobody answered".
-- Done by trigger so add_option keeps its body.
create function private.create_availability_tally() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.availability_tallies (option_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function private.create_availability_tally() from public, anon, authenticated;
create trigger create_availability_tally after insert on public.pick_options
  for each row execute function private.create_availability_tally();
insert into public.availability_tallies (option_id) select o.id from public.pick_options o on conflict do nothing;

-- Adjusts counts by the change instead of recounting, so two writers never overwrite each other with a stale count.
-- Also runs when an account is deleted and its rows cascade away.
create function private.keep_availability_tallies() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.availability_tallies t set
      free = t.free - (old.status = 'free')::int,
      busy = t.busy - (old.status = 'busy')::int
    where t.option_id = old.option_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.availability_tallies t set
      free = t.free + (new.status = 'free')::int,
      busy = t.busy + (new.status = 'busy')::int
    where t.option_id = new.option_id;
  end if;
  return null;
end $$;
revoke all on function private.keep_availability_tallies() from public, anon, authenticated;
create trigger keep_availability_tallies after insert or update or delete on public.availability
  for each row execute function private.keep_availability_tallies();

alter table public.picks add column availability_enabled boolean not null default false;

-- Sets the caller's Free or Busy for one time option; null clears it. Same answer again changes nothing.
create function public.set_availability(option_id uuid, status text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; pk public.picks; pid uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if status is not null and status not in ('free', 'busy') then
    raise exception 'invalid_availability' using errcode = 'P0001';
  end if;
  select o.pick_id into pid from public.pick_options o where o.id = set_availability.option_id;
  if pid is null then raise exception 'option_not_found' using errcode = 'P0001'; end if;
  -- Same lock as cast_vote: answers and close_pick on one pick run one at a time.
  select * into pk from public.picks p where p.id = pid for update;
  if not private.is_group_member(pk.group_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not pk.availability_enabled then raise exception 'availability_off' using errcode = 'P0001'; end if;
  if pk.state <> 'open' or pk.deadline <= now() then raise exception 'voting_closed' using errcode = 'P0001'; end if;
  if status is null then
    delete from public.availability a where a.option_id = set_availability.option_id and a.user_id = uid;
  else
    insert into public.availability (option_id, user_id, status, source)
      values (set_availability.option_id, uid, status, 'manual')
    on conflict on constraint availability_pkey do update
      set status = excluded.status, source = 'manual', updated_at = now()
      where public.availability.status is distinct from excluded.status or public.availability.source <> 'manual';
  end if;
end $$;
revoke all on function public.set_availability(uuid, text) from public, anon;
grant execute on function public.set_availability(uuid, text) to authenticated;

-- Same body as 20261117130000_set_save_required_client_key.sql, plus the optional last parameter.
drop function public.create_pick(uuid, jsonb, timestamptz, integer, uuid);
create function public.create_pick(group_id uuid, options jsonb, deadline timestamptz,
  starred integer, client_key uuid, availability boolean default false) returns uuid
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
  insert into public.picks (group_id, organizer_id, client_key, deadline, availability_enabled)
    values (group_id, uid, client_key, deadline, coalesce(create_pick.availability, false)) returning id into pid;
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
revoke all on function public.create_pick(uuid, jsonb, timestamptz, integer, uuid, boolean) from public, anon;
grant execute on function public.create_pick(uuid, jsonb, timestamptz, integer, uuid, boolean) to authenticated;

commit;
