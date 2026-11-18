-- TEC-136 (P1-02 backend, decisions N1, N3): per-group opt-in to calendar-filled Free or Busy.
-- 1. calendar_shares: a row means "this person lets their calendar answer in this group". Readable only by its owner.
-- 2. set_calendar_share(group_id, enabled): turning it off deletes that person's calendar answers in the group, which
--    drops the tallies back through keep_availability_tallies. Manual answers stay.
-- 3. A person's share and calendar answers end with their membership (leave, removal, account deletion).
-- Not here: writing a calendar answer. set_availability(option_id, status) has no way to say 'calendar', so that waits
-- on a spec-decision (see the PR). No calendar contents ever reach the server (rule 8); only the Free or Busy answer does.
begin;

create table public.calendar_shares (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
create index calendar_shares_group on public.calendar_shares(group_id);

alter table public.calendar_shares enable row level security;
revoke all on table public.calendar_shares from public, anon, authenticated;
grant select on table public.calendar_shares to authenticated;
create policy own_calendar_shares on public.calendar_shares for select to authenticated
  using (user_id = (select auth.uid()));

-- Removes one person's calendar-sourced answers on every pick of one group. Deleting fires the tally trigger.
create function private.clear_calendar_answers(target_user uuid, target_group uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.availability a
  using public.pick_options o, public.picks p
  where a.user_id = target_user and a.source = 'calendar'
    and o.id = a.option_id and p.id = o.pick_id and p.group_id = target_group;
$$;
revoke all on function private.clear_calendar_answers(uuid, uuid) from public, anon, authenticated;

create function public.set_calendar_share(group_id uuid, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if enabled is null then raise exception 'invalid_enabled' using errcode = 'P0001'; end if;
  if not private.is_group_member(group_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if enabled then
    insert into public.calendar_shares (user_id, group_id) values (uid, group_id) on conflict do nothing;
  else
    delete from public.calendar_shares s where s.user_id = uid and s.group_id = set_calendar_share.group_id;
    perform private.clear_calendar_answers(uid, set_calendar_share.group_id);
  end if;
end $$;
revoke all on function public.set_calendar_share(uuid, boolean) from public, anon;
grant execute on function public.set_calendar_share(uuid, boolean) to authenticated;

-- Membership ends by leave_group, remove_member or delete_account. One trigger covers all three, so none of
-- their bodies change. Rejoining starts with sharing off.
create function private.end_calendar_share() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.removed_at is not null or new.blocked then
    delete from public.calendar_shares s where s.user_id = old.user_id and s.group_id = old.group_id;
    perform private.clear_calendar_answers(old.user_id, old.group_id);
  end if;
  return null;
end $$;
revoke all on function private.end_calendar_share() from public, anon, authenticated;
create trigger end_calendar_share after update or delete on public.group_members
  for each row execute function private.end_calendar_share();

commit;
