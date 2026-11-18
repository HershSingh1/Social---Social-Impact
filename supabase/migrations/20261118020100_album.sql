-- TEC-133 (P2-02 backend, 1 of 3, decision N8): the shared album's tables and functions.
-- The private bucket and its access rules are TEC-138; stripping location data on the server is TEC-139.
-- storage_path is plain text here: nothing in this migration checks that the file exists or whose it is.
begin;

-- One photo or one note on a past plan. A photo may carry a short caption in `note`; a note must have text.
create table public.album_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('photo', 'note')),
  storage_path text check (storage_path is null or length(storage_path) between 1 and 500),
  audience text not null default 'plan' check (audience in ('plan', 'group')),
  note text check (note is null or length(note) between 1 and 500),
  reported_count integer not null default 0 check (reported_count >= 0),
  client_key uuid not null unique,
  created_at timestamptz not null default now(),
  check ((kind = 'photo') = (storage_path is not null)),
  check (kind = 'photo' or note is not null)
);
create index album_items_plan on public.album_items(plan_id, created_at);
create index album_items_owner on public.album_items(user_id, plan_id);
create unique index album_items_path on public.album_items(storage_path) where storage_path is not null;

-- One report per person per item. Deleting the item or the account removes the report with it.
create table public.album_reports (
  item_id uuid not null references public.album_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index album_reports_user on public.album_reports(user_id);

-- Who may see an item, before the reporter's own hiding is applied. Definer, like can_read_plan, so the policy
-- does not depend on the caller's own read access to plans or memberships.
--   the owner         always, even after leaving the group or being removed from the plan
--   audience = plan   the plan's invitees (can_read_plan: the organizer and invitees who are not removed)
--   audience = group  the plan's invitees as well as current members of the plan's group: sharing only widens
create function private.can_see_album_item(item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.album_items i
    where i.id = item and (
      i.user_id = (select auth.uid())
      or private.can_read_plan(i.plan_id)
      or (i.audience = 'group' and exists (
        select 1 from public.plans p where p.id = i.plan_id and p.group_id is not null and private.is_group_member(p.group_id)))
    ));
$$;
revoke all on function private.can_see_album_item(uuid) from public, anon;
grant execute on function private.can_see_album_item(uuid) to authenticated;

alter table public.album_items enable row level security;
alter table public.album_reports enable row level security;
revoke all on table public.album_items, public.album_reports from public, anon, authenticated;
grant select on table public.album_items, public.album_reports to authenticated;

-- Albums are never public. An item you reported is hidden from you only; everyone else still sees it.
create policy album_visible on public.album_items for select to authenticated
  using (
    private.can_see_album_item(id)
    and not exists (select 1 from public.album_reports r where r.item_id = id and r.user_id = (select auth.uid()))
  );
create policy own_album_reports on public.album_reports for select to authenticated
  using (user_id = (select auth.uid()));

-- Not in the Realtime publication: change payloads would carry notes and file paths. The app refetches instead.

-- Posts a photo or a note. Only an invitee who answered Yes to "did you go" (P2-01 attendance) and is still on
-- the plan. A missing plan, a draft, a cancelled plan and a plan the caller was not at all give not_attended.
-- At most 20 photos per person per plan; a deleted photo frees its place. A note is 1 to 500 characters.
-- Same client_key and same content returns the same id; the same key with different content, or from another
-- person, is client_key_conflict. A new item starts with audience = plan.
create function public.add_album_item(client_key uuid, plan_id uuid, kind text, storage_path text, note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  txt text := nullif(btrim(note), '');
  path text := nullif(btrim(storage_path), '');
  existing public.album_items;
  new_id uuid;
begin
  if client_key is null then raise exception 'invalid_client_key' using errcode = 'P0001'; end if;
  if kind is null or kind not in ('photo', 'note') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if kind = 'photo' and path is null then raise exception 'storage_path_required' using errcode = 'P0001'; end if;
  if kind = 'note' and path is not null then raise exception 'invalid_storage_path' using errcode = 'P0001'; end if;
  if kind = 'note' and txt is null then raise exception 'note_required' using errcode = 'P0001'; end if;
  if length(txt) > 500 then raise exception 'note_too_long' using errcode = 'P0001'; end if;
  if length(path) > 500 then raise exception 'invalid_storage_path' using errcode = 'P0001'; end if;

  -- Serialises one person's posts to one plan, so two taps cannot both take the 20th place or both insert.
  perform pg_advisory_xact_lock(hashtextextended('album:' || add_album_item.plan_id::text || uid::text, 0));

  select * into existing from public.album_items i where i.client_key = add_album_item.client_key;
  if found then
    if existing.user_id <> uid or existing.plan_id <> add_album_item.plan_id or existing.kind <> add_album_item.kind
       or existing.storage_path is distinct from path or existing.note is distinct from txt then
      raise exception 'client_key_conflict' using errcode = 'P0001';
    end if;
    return existing.id;
  end if;

  if not exists (
    select 1 from public.plans p
    join public.attendance a on a.plan_id = p.id and a.user_id = uid and a.attended = 'yes'
    join public.rsvps r on r.plan_id = p.id and r.user_id = uid and r.removed_at is null
    where p.id = add_album_item.plan_id and p.state = 'sent'
  ) then
    raise exception 'not_attended' using errcode = '42501';
  end if;

  if kind = 'photo' and (
    select count(*) from public.album_items i
    where i.plan_id = add_album_item.plan_id and i.user_id = uid and i.kind = 'photo') >= 20 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;

  begin
    insert into public.album_items (plan_id, user_id, kind, storage_path, note, client_key)
      values (add_album_item.plan_id, uid, add_album_item.kind, path, txt, add_album_item.client_key)
      returning id into new_id;
  exception when unique_violation then
    -- Another item already uses this storage_path (the key is new: it was looked up above).
    raise exception 'invalid_storage_path' using errcode = 'P0001';
  end;
  return new_id;
end $$;
revoke all on function public.add_album_item(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.add_album_item(uuid, uuid, text, text, text) to authenticated;

-- The owner removes their own item at any time, even after leaving the group or the plan. Reports on it go too.
-- Someone else's item and a missing one give the same not_found. The file itself is removed with the bucket (TEC-138).
create function public.delete_album_item(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
begin
  delete from public.album_items i where i.id = delete_album_item.id and i.user_id = uid;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
end $$;
revoke all on function public.delete_album_item(uuid) from public, anon;
grant execute on function public.delete_album_item(uuid) to authenticated;

-- Hides the item for the caller and counts the report once per person. Anyone who can see the item may report
-- it except its owner; anyone else gets not_found. Reporting again changes nothing.
-- The review queue that reads reported_count is not built yet.
create function public.report_album_item(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  owner uuid;
  inserted integer;
begin
  select i.user_id into owner from public.album_items i where i.id = report_album_item.id for update;
  if not found or not private.can_see_album_item(report_album_item.id) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if owner = uid then raise exception 'own_item' using errcode = 'P0001'; end if;
  insert into public.album_reports (item_id, user_id) values (report_album_item.id, uid)
    on conflict on constraint album_reports_pkey do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    update public.album_items i set reported_count = i.reported_count + 1 where i.id = report_album_item.id;
  end if;
end $$;
revoke all on function public.report_album_item(uuid) from public, anon;
grant execute on function public.report_album_item(uuid) to authenticated;

-- Owner only: plan audience becomes group. One way; sharing again changes nothing. A plan with no group has no
-- group to share with (no_group).
create function public.share_album_item(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  gid uuid;
begin
  select p.group_id into gid from public.album_items i join public.plans p on p.id = i.plan_id
    where i.id = share_album_item.id and i.user_id = uid for update of i;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  if gid is null then raise exception 'no_group' using errcode = 'P0001'; end if;
  update public.album_items i set audience = 'group' where i.id = share_album_item.id;
end $$;
revoke all on function public.share_album_item(uuid) from public, anon;
grant execute on function public.share_album_item(uuid) to authenticated;

commit;
