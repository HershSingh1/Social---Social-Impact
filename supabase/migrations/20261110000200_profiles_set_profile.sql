-- TEC-26 (P0-02 backend): profile row at sign-up, set_profile, require_profile guard.
begin;

-- Sign-up trigger. Name stays null until set_profile runs (D1: no guests, no is_guest).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
-- Accounts that signed up before this trigger existed.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- Guard for every write RPC: start with `uid := public.require_profile();`.
-- Rejects signed-out and anonymous JWTs, and raises profile_required while display_name is null.
-- Definer so it can read profiles; not callable by clients.
create function public.require_profile() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = uid and display_name is not null) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  return uid;
end $$;
revoke all on function public.require_profile() from public, anon, authenticated;

-- First write a new user can make, so it checks auth but not profile_required.
create function public.set_profile(display_name text, avatar_path text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean text := trim(set_profile.display_name);
begin
  if uid is null or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if clean is null or length(clean) not between 1 and 60 then
    raise exception 'invalid_display_name' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, display_name, avatar_path) values (uid, clean, set_profile.avatar_path)
    on conflict (id) do update set display_name = excluded.display_name, avatar_path = excluded.avatar_path;
end $$;
revoke all on function public.set_profile(text, text) from public, anon;
grant execute on function public.set_profile(text, text) to authenticated;
commit;
