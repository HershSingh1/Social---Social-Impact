-- TEC-108 (P0-02 backend): optional city and age on the profile (PRO-9 F1, minimum age 13).
-- Both stay private: profiles is own-row-only (own_profile policy) and get_profile_cards
-- projects only display_name and avatar_path, so neither is shared with anyone in P0.
begin;

alter table public.profiles
  add column city text check (city is null or length(trim(city)) between 1 and 60),
  add column age smallint check (age is null or age between 13 and 120);

-- Replace the two-argument function outright so no overload is left behind.
drop function public.set_profile(text, text);

-- First write a new user can make, so it checks auth but not profile_required.
-- Omitted avatar_path, city and age are stored as null, same as avatar_path always was.
-- Error messages never include the submitted values.
create function public.set_profile(
  display_name text, avatar_path text default null, city text default null, age integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean text := trim(set_profile.display_name);
  clean_city text := nullif(trim(set_profile.city), '');
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
  insert into public.profiles (id, display_name, avatar_path, city, age)
    values (uid, clean, set_profile.avatar_path, clean_city, set_profile.age)
    on conflict (id) do update set display_name = excluded.display_name,
      avatar_path = excluded.avatar_path, city = excluded.city, age = excluded.age;
end $$;
revoke all on function public.set_profile(text, text, text, integer) from public, anon;
grant execute on function public.set_profile(text, text, text, integer) to authenticated;
commit;
