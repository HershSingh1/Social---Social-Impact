-- TEC-138 (P2-02 backend, 2 of 3, decision N8): the private `album` bucket and who may open its files.
-- Tables and functions are TEC-133; stripping location data on the server is TEC-139.
-- Files live at <plan id>/<user id>/<random name>.jpg and are never public.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', false, 15728640, array['image/jpeg']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The plan id and user id in an album file name, or null when the name is not <uuid>/<uuid>/<name>.jpg.
-- The regex runs before any cast, so a malformed name is refused instead of raising a cast error.
create function private.album_path_plan(name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,100}\.jpg$'
    then split_part(name, '/', 1)::uuid end;
$$;
create function private.album_path_user(name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when private.album_path_plan(name) is not null then split_part(name, '/', 2)::uuid end;
$$;

-- Same rule as add_album_item: still on the plan (not removed), answered Yes to "did you go", plan sent.
-- Definer, so the policy does not depend on the caller's own read access to attendance and RSVPs.
create function private.can_add_album_item(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plans p
    join public.attendance a on a.plan_id = p.id and a.user_id = (select auth.uid()) and a.attended = 'yes'
    join public.rsvps r on r.plan_id = p.id and r.user_id = (select auth.uid()) and r.removed_at is null
    where p.id = target and p.state = 'sent');
$$;

-- Whether the caller may open this file because of the album item that points at it. Same visibility as the
-- album_items row policy (plan audience, group audience, and hidden for someone who reported it). The item must
-- sit in the folder its path names (plan and user), so an item cannot claim another person's file by writing
-- that file's path into storage_path.
create function private.can_read_album_file(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.album_items i
    where i.storage_path = name
      and i.plan_id = private.album_path_plan(name)
      and i.user_id = private.album_path_user(name)
      and private.can_see_album_item(i.id)
      and not exists (select 1 from public.album_reports r where r.item_id = i.id and r.user_id = (select auth.uid())));
$$;

revoke all on function private.album_path_plan(text), private.album_path_user(text),
  private.can_add_album_item(uuid), private.can_read_album_file(text) from public, anon;
grant execute on function private.album_path_plan(text), private.album_path_user(text),
  private.can_add_album_item(uuid), private.can_read_album_file(text) to authenticated;

-- Upload: only into your own folder, only for a plan you can add items to. Files are never overwritten
-- (no UPDATE policy), so a name is used once.
create policy album_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'album'
  and private.album_path_user(name) = (select auth.uid())
  and private.can_add_album_item(private.album_path_plan(name))
);

-- Read: your own folder (so you can see what you just uploaded, and after leaving the group), or any file whose
-- album item you can read. Signed URLs inherit this check when they are made; the app asks for short ones.
create policy album_read on storage.objects for select to authenticated
using (
  bucket_id = 'album'
  and (
    private.album_path_user(name) = (select auth.uid())
    or private.can_read_album_file(name)
  )
);

-- Delete: the owner at any time, including after leaving the group or the plan.
create policy album_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'album'
  and private.album_path_user(name) = (select auth.uid())
);

-- Deleting an item (delete_album_item, or the cascade from a deleted plan or account) deletes its file.
-- Only the file in the item's own folder: an item that wrote someone else's path into storage_path cannot
-- delete that file. The object row goes, so no signed URL can be made for it afterwards.
create function private.delete_album_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.storage_path is not null
     and old.storage_path = old.plan_id::text || '/' || old.user_id::text || '/' || split_part(old.storage_path, '/', 3) then
    -- Storage can refuse direct deletes unless this is set for the statement.
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects o where o.bucket_id = 'album' and o.name = old.storage_path;
  end if;
  return old;
end $$;
revoke all on function private.delete_album_file() from public, anon, authenticated;

create trigger album_items_delete_file after delete on public.album_items
  for each row execute function private.delete_album_file();

commit;
