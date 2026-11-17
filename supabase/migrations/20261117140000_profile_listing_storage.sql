-- TEC-135 (P0-17): public profile/listing images with owner-only writes (G14).
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 1048576, array['image/jpeg']::text[]),
  ('listing-images', 'listing-images', true, 1048576, array['image/jpeg']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve known object URLs without a SELECT policy. This metadata
-- policy is intentionally owner-only so a public image does not make the bucket listable.
create policy sidequest_media_owner_select
on storage.objects for select to authenticated
using (
  bucket_id in ('avatars', 'listing-images')
  and split_part(name, '/', 1) = (select auth.uid())::text
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) = ''
  and right(name, 4) = '.jpg'
);

create policy sidequest_media_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id in ('avatars', 'listing-images')
  and split_part(name, '/', 1) = (select auth.uid())::text
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) = ''
  and right(name, 4) = '.jpg'
);

create policy sidequest_media_owner_update
on storage.objects for update to authenticated
using (
  bucket_id in ('avatars', 'listing-images')
  and split_part(name, '/', 1) = (select auth.uid())::text
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) = ''
  and right(name, 4) = '.jpg'
)
with check (
  bucket_id in ('avatars', 'listing-images')
  and split_part(name, '/', 1) = (select auth.uid())::text
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) = ''
  and right(name, 4) = '.jpg'
);

create policy sidequest_media_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id in ('avatars', 'listing-images')
  and split_part(name, '/', 1) = (select auth.uid())::text
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) = ''
  and right(name, 4) = '.jpg'
);

-- Keep the existing profile contract, adding only the G14 avatar-path check.
-- Error messages never include the submitted path or user id.
create or replace function public.set_profile(
  display_name text, avatar_path text default null, city text default null, age integer default null,
  username text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean text := trim(set_profile.display_name);
  clean_avatar text := nullif(trim(set_profile.avatar_path), '');
  clean_city text := nullif(trim(set_profile.city), '');
  clean_username text := nullif(trim(set_profile.username), '');
begin
  if uid is null or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if clean is null or length(clean) not between 1 and 60 then
    raise exception 'invalid_display_name' using errcode = 'P0001';
  end if;
  if set_profile.avatar_path is not null and (
    clean_avatar is null
    or split_part(clean_avatar, '/', 1) <> uid::text
    or split_part(clean_avatar, '/', 2) = ''
    or split_part(clean_avatar, '/', 3) <> ''
    or right(clean_avatar, 4) <> '.jpg'
  ) then
    raise exception 'invalid_avatar_path' using errcode = 'P0001';
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
      values (uid, clean, clean_avatar, clean_city, set_profile.age, clean_username)
      on conflict (id) do update set display_name = excluded.display_name,
        avatar_path = excluded.avatar_path, city = excluded.city, age = excluded.age,
        username = coalesce(excluded.username, public.profiles.username);
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;
end $$;

commit;
