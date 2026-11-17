-- TEC-114 (P0-02 backend): username on the profile (spec-decisions F1, Figma 1.3).
-- Stored as typed (the app shows "@Hershey"), unique ignoring case. Nullable: accounts made before this have none.
-- Private for now: profiles is own-row-only and get_profile_cards is unchanged, so nobody else can read it.
begin;

alter table public.profiles
  add column username text check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$');
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- Replace the four-argument function outright so no overload is left behind.
drop function public.set_profile(text, text, text, integer);

-- Same rules as before for name, avatar, city and age (omitted ones are cleared). Username differs: a null or
-- blank argument keeps the current one, because the app only sends it during setup.
-- Error messages never include the submitted values; the caught unique_violation would otherwise echo the name.
create function public.set_profile(
  display_name text, avatar_path text default null, city text default null, age integer default null,
  username text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean text := trim(set_profile.display_name);
  clean_city text := nullif(trim(set_profile.city), '');
  clean_username text := nullif(trim(set_profile.username), '');
begin
  if uid is null or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if clean is null or length(clean) not between 1 and 60 then
    raise exception 'invalid_display_name' using errcode = 'P0001';
  end if;
  if length(clean_city) > 60 then
    raise exception 'invalid_city' using errcode = 'P0001';
  end if;
  if set_profile.age is not null and set_profile.age not between 13 and 120 then
    raise exception 'invalid_age' using errcode = 'P0001';
  end if;
  if clean_username !~ '^[A-Za-z0-9_]{3,20}$'
     or lower(clean_username) in ('admin', 'administrator', 'support', 'help', 'sidequest') then
    raise exception 'invalid_username' using errcode = 'P0001';
  end if;
  begin
    insert into public.profiles (id, display_name, avatar_path, city, age, username)
      values (uid, clean, set_profile.avatar_path, clean_city, set_profile.age, clean_username)
      on conflict (id) do update set display_name = excluded.display_name,
        avatar_path = excluded.avatar_path, city = excluded.city, age = excluded.age,
        username = coalesce(excluded.username, public.profiles.username);
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;
end $$;
revoke all on function public.set_profile(text, text, text, integer, text) from public, anon;
grant execute on function public.set_profile(text, text, text, integer, text) to authenticated;
commit;
