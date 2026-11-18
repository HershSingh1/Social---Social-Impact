-- TEC-134 (P2-05 backend, decision N10): group bucket list and seasonal collections.
-- 1. bucket_items + set_bucket_item: "Want to do someday", one row per member per experience per group.
-- 2. group_bucket_list: the group's list, most-wanted first.
-- 3. collections + collection_items: readable only between starts_on and ends_on, no client writes.
begin;

create table public.bucket_items (
  group_id uuid not null references public.groups(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, experience_id, user_id),
  foreign key (group_id, user_id) references public.group_members(group_id, user_id) on delete cascade
);
create index bucket_items_user on public.bucket_items(user_id);
create index bucket_items_experience on public.bucket_items(experience_id);

alter table public.bucket_items enable row level security;
revoke all on table public.bucket_items from public, anon, authenticated;
grant select on table public.bucket_items to authenticated;

-- Active members read the whole group's rows, who added each one included. That matches group saves,
-- which the group Saved ideas screen already shows with "Saved by ...".
create policy member_bucket_items on public.bucket_items for select to authenticated
  using (private.is_group_member(group_id));

-- Sets the viewer's own "want to do someday" for one experience in one group to the wanted state.
-- Calling it again with the same values changes nothing, same as set_save.
create function public.set_bucket_item(experience_id uuid, group_id uuid, wanted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  if set_bucket_item.wanted is null then
    raise exception 'invalid_wanted' using errcode = 'P0001';
  end if;
  if set_bucket_item.group_id is null or not private.is_group_member(set_bucket_item.group_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if not set_bucket_item.wanted then
    delete from public.bucket_items b
      where b.group_id = set_bucket_item.group_id
        and b.experience_id = set_bucket_item.experience_id
        and b.user_id = uid;
    return;
  end if;

  if exists (
    select 1 from public.bucket_items b
      where b.group_id = set_bucket_item.group_id
        and b.experience_id = set_bucket_item.experience_id
        and b.user_id = uid
  ) then
    return;
  end if;
  if not exists (
    select 1 from public.experiences e
      where e.id = set_bucket_item.experience_id and e.status = 'published'
  ) then
    raise exception 'experience_not_found' using errcode = 'P0001';
  end if;
  insert into public.bucket_items (group_id, experience_id, user_id)
    values (set_bucket_item.group_id, set_bucket_item.experience_id, uid)
    on conflict do nothing;
end $$;
revoke all on function public.set_bucket_item(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_bucket_item(uuid, uuid, boolean) to authenticated;

-- Soft-removing or blocking a member clears their bucket items in that group, like
-- clear_group_saves_on_membership_end in 20261111000200_saves.sql. The cascade covers hard deletes.
create function private.clear_bucket_items_on_membership_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.removed_at is null and not old.blocked
      and (new.removed_at is not null or new.blocked) then
    delete from public.bucket_items b where b.group_id = new.group_id and b.user_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function private.clear_bucket_items_on_membership_end() from public, anon, authenticated;

create trigger clear_bucket_items_when_membership_ends
  after update of removed_at, blocked on public.group_members
  for each row execute function private.clear_bucket_items_on_membership_end();

-- The group's list, most-wanted first (ties by name). Runs as the caller, so RLS applies: a nonmember gets
-- no rows, and removed listings drop out through the catalog policy. user_ids is who added it.
create function public.group_bucket_list(group_id uuid)
returns table (experience_id uuid, want_count bigint, user_ids uuid[])
language sql stable set search_path = '' as $$
  select b.experience_id, count(*) as want_count, array_agg(b.user_id order by b.user_id) as user_ids
  from public.bucket_items b
  join public.experiences e on e.id = b.experience_id
  where b.group_id = group_bucket_list.group_id
  group by b.experience_id, e.name
  order by count(*) desc, e.name, b.experience_id;
$$;
revoke all on function public.group_bucket_list(uuid) from public, anon;
grant execute on function public.group_bucket_list(uuid) to authenticated;

-- Seasonal collections. Admins maintain these directly in the dev project (D12); clients only read.
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  curator_name text not null check (length(btrim(curator_name)) > 0),
  starts_on date not null,
  ends_on date not null,
  review_on date not null,
  check (ends_on >= starts_on)
);
create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  primary key (collection_id, experience_id)
);
create index collection_items_experience on public.collection_items(experience_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
revoke all on table public.collections, public.collection_items from public, anon, authenticated;
grant select on table public.collections, public.collection_items to authenticated;

-- "Today" is the America/Chicago date, so a collection disappears at midnight Austin time after ends_on
-- with no job or code change.
create policy in_season_collections on public.collections for select to authenticated
  using ((now() at time zone 'America/Chicago')::date between starts_on and ends_on);
-- The subquery runs under the policy above, so items follow their collection.
create policy in_season_collection_items on public.collection_items for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id));

commit;
