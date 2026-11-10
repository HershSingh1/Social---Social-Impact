-- Helpers used by RLS policies and RPCs. They live in `private`, which is not exposed through the API
-- (Supabase exposes only `public`), so clients cannot call them directly.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Signed in with Apple / email code (not an anonymous guest). Relies on the `is_anonymous` JWT claim.
create function private.is_account() returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- Active membership: joined, not removed, not blocked.
create function private.is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = auth.uid()
      and gm.removed_at is null and not gm.blocked)
$$;

create function private.pick_group(p_pick uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select group_id from public.picks where id = p_pick
$$;

create function private.is_plan_invitee(p_plan uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.rsvps r
    where r.plan_id = p_plan and r.user_id = auth.uid() and r.removed_at is null)
$$;

create function private.is_plan_organizer(p_plan uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.plans p where p.id = p_plan and p.organizer_id = auth.uid())
$$;

-- Does the caller share an active group with p_user? (profile visibility)
create function private.shares_group(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = p_user
      and a.removed_at is null and not a.blocked
      and b.removed_at is null and not b.blocked)
$$;

-- Does the caller share a plan (as invitee) with p_user?
create function private.shares_plan(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.rsvps a
    join public.rsvps b on b.plan_id = a.plan_id
    where a.user_id = auth.uid() and b.user_id = p_user
      and a.removed_at is null and b.removed_at is null)
$$;

-- Wall-clock time in a zone -> UTC instant. Rejects local times that do not exist (DST spring-forward gap)
-- instead of silently shifting them.
create function private.local_to_utc(p_local timestamp, p_tz text) returns timestamptz
language plpgsql stable as $$
declare v timestamptz;
begin
  if p_local is null then raise exception 'invalid_time'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'invalid_time_zone';
  end if;
  v := p_local at time zone p_tz;
  if (v at time zone p_tz) <> p_local then
    raise exception 'nonexistent_local_time';
  end if;
  return v;
end $$;

-- Random 6-char join code from A-Z, 2-9 minus 0 O 1 I (32 symbols, so byte % 32 is unbiased).
create function private.generate_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  out text := '';
  i int;
begin
  for i in 0 .. 5 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create function private.plan_counts(p_plan uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'going',           count(*) filter (where status = 'going'),
    'awaiting',        count(*) filter (where status = 'awaiting'),
    'cant_go',         count(*) filter (where status = 'cant_go'),
    'needs_reconfirm', count(*) filter (where status = 'needs_reconfirm'),
    'revision',        (select current_revision from public.plans where id = p_plan))
  from public.rsvps where plan_id = p_plan and removed_at is null
$$;

-- Keep profiles.is_guest in step with auth: a guest who signs in keeps the same user id.
create function private.sync_guest_flag() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set is_guest = new.is_anonymous where id = new.id;
  return new;
end $$;

create trigger on_auth_user_anonymity_changed
  after update of is_anonymous on auth.users
  for each row when (old.is_anonymous is distinct from new.is_anonymous)
  execute function private.sync_guest_flag();
