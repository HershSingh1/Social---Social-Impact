-- TEC-86 (P0-07): private and group saves.
begin;

create table public.saves (
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  unique nulls not distinct (experience_id, user_id, group_id),
  foreign key (group_id, user_id) references public.group_members(group_id, user_id) on delete cascade
);
create index saves_user on public.saves(user_id);
create index saves_group on public.saves(group_id) where group_id is not null;

alter table public.saves enable row level security;
revoke all on table public.saves from public, anon, authenticated;
grant select on table public.saves to authenticated;

-- Personal saves are private. Active members share the rows in their group library.
create policy readable_saves on public.saves for select to authenticated using (
  (group_id is null and user_id = (select auth.uid()))
  or (group_id is not null and private.is_group_member(group_id))
);

-- Returns true when the row now exists and false when the existing row was removed.
create function public.toggle_save(experience_id uuid, group_id uuid default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  if toggle_save.group_id is not null and not private.is_group_member(toggle_save.group_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  delete from public.saves s
    where s.experience_id = toggle_save.experience_id
      and s.user_id = uid
      and s.group_id is not distinct from toggle_save.group_id;
  if found then return false; end if;

  if not exists (
    select 1 from public.experiences e
      where e.id = toggle_save.experience_id and e.status = 'published'
  ) then
    raise exception 'experience_not_found' using errcode = 'P0001';
  end if;

  insert into public.saves (experience_id, user_id, group_id)
    values (toggle_save.experience_id, uid, toggle_save.group_id);
  return true;
end $$;
revoke all on function public.toggle_save(uuid, uuid) from public, anon;
grant execute on function public.toggle_save(uuid, uuid) to authenticated;

-- Membership rows are soft-removed. Delete that person's group-scoped saves as soon as
-- the membership becomes inactive; personal saves are deliberately unaffected.
create function private.clear_group_saves_on_membership_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.saves s where s.group_id = old.group_id and s.user_id = old.user_id;
    return old;
  end if;
  if old.removed_at is null and not old.blocked
      and (new.removed_at is not null or new.blocked) then
    delete from public.saves s where s.group_id = new.group_id and s.user_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function private.clear_group_saves_on_membership_end() from public, anon, authenticated;

create trigger clear_group_saves_when_membership_ends
  after update of removed_at, blocked or delete on public.group_members
  for each row execute function private.clear_group_saves_on_membership_end();

commit;
