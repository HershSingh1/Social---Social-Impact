-- TEC-26 (P0-02 backend): profile row at sign-up, set_profile, and the profile_required gate.
-- No guests (D1): there is no is_guest column and anonymous sign-ins are off in config.toml.
begin;

-- A profile row exists from first sign-in, with a null display_name until set_profile runs.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill users that signed in before this migration.
insert into public.profiles (id) select u.id from auth.users u on conflict (id) do nothing;

-- Shared gate for every write RPC. Call it first: perform public.require_profile();
-- Returns the caller's id. Raises not_authenticated (28000), anonymous_not_allowed (42501)
-- or profile_required (P0001) while display_name is null.
create function public.require_profile() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); name text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'anonymous_not_allowed' using errcode = '42501';
  end if;
  select p.display_name into name from public.profiles p where p.id = uid;
  if name is null then raise exception 'profile_required' using errcode = 'P0001'; end if;
  return uid;
end;
$$;

-- Sets the caller's name (1-60 chars after trim) and optional avatar. Needs no existing name.
-- avatar_path is only replaced when a value is passed; budget_cap and transport are untouched.
create function public.set_profile(display_name text, avatar_path text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); clean text := trim(display_name);
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'anonymous_not_allowed' using errcode = '42501';
  end if;
  if clean is null or length(clean) not between 1 and 60 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  update public.profiles p set display_name = clean, avatar_path = coalesce(set_profile.avatar_path, p.avatar_path)
    where p.id = uid;
  if not found then
    insert into public.profiles (id, display_name, avatar_path) values (uid, clean, set_profile.avatar_path);
  end if;
end;
$$;

revoke all on function public.require_profile(), public.set_profile(text, text) from public, anon;
grant execute on function public.require_profile(), public.set_profile(text, text) to authenticated;
commit;
