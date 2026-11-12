-- TEC-81 (P0-03): owner-managed join codes and membership.
begin;

-- All management operations lock the group first. This keeps an ownership transfer,
-- removal, and departure from observing a half-finished membership change.
create function private.require_group_owner(target_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  perform 1 from public.groups g where g.id = target_group_id and g.archived_at is null for update;
  if not found then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.groups g
    join public.group_members m on m.group_id = g.id and m.user_id = uid
    where g.id = target_group_id and g.owner_id = uid and m.removed_at is null and not m.blocked
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
end $$;
revoke all on function private.require_group_owner(uuid) from public, anon, authenticated;

create function public.revoke_code(group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_group_owner(revoke_code.group_id);
  update public.join_codes set revoked_at = now()
    where join_codes.group_id = revoke_code.group_id and revoked_at is null;
end $$;

create function public.regenerate_code(group_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.join_codes; attempt integer;
begin
  perform private.require_group_owner(regenerate_code.group_id);
  update public.join_codes set revoked_at = now()
    where join_codes.group_id = regenerate_code.group_id and revoked_at is null;
  for attempt in 1..20 loop
    begin
      insert into public.join_codes (code, group_id, expires_at)
        values (private.generate_join_code(), regenerate_code.group_id, now() + interval '14 days')
        returning * into c;
      return jsonb_build_object('code', c.code, 'expires_at', c.expires_at);
    exception when unique_violation then
      if attempt = 20 then raise exception 'code_generation_failed' using errcode = 'P0001'; end if;
    end;
  end loop;
end $$;

create function public.remove_member(group_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.group_members;
begin
  perform private.require_group_owner(remove_member.group_id);
  select * into m from public.group_members
    where group_members.group_id = remove_member.group_id and group_members.user_id = remove_member.user_id
      and removed_at is null and not blocked for update;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  if m.role = 'owner' then raise exception 'cannot_remove_owner' using errcode = 'P0001'; end if;
  update public.group_members set removed_at = now(), blocked = true
    where group_members.group_id = remove_member.group_id and group_members.user_id = remove_member.user_id;
end $$;

create function public.allow_back(group_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_group_owner(allow_back.group_id);
  update public.group_members set blocked = false
    where group_members.group_id = allow_back.group_id and group_members.user_id = allow_back.user_id
      and removed_at is not null and blocked;
  if not found then raise exception 'member_not_removed' using errcode = 'P0001'; end if;
end $$;

create function public.transfer_owner(group_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  perform private.require_group_owner(transfer_owner.group_id);
  if transfer_owner.user_id = uid then raise exception 'already_owner' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.group_members m where m.group_id = transfer_owner.group_id and m.user_id = transfer_owner.user_id
      and m.removed_at is null and not m.blocked
  ) then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  update public.group_members set role = 'member'
    where group_members.group_id = transfer_owner.group_id and group_members.user_id = uid;
  update public.group_members set role = 'owner'
    where group_members.group_id = transfer_owner.group_id and group_members.user_id = transfer_owner.user_id;
  update public.groups set owner_id = transfer_owner.user_id where id = transfer_owner.group_id;
end $$;

create function public.leave_group(group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  g public.groups;
begin
  select * into g from public.groups where id = leave_group.group_id and archived_at is null for update;
  if not found then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.group_members m where m.group_id = g.id and m.user_id = uid
      and m.removed_at is null and not m.blocked
  ) then raise exception 'not_a_member' using errcode = '42501'; end if;

  if g.owner_id = uid then
    if exists (
      select 1 from public.group_members m where m.group_id = g.id and m.user_id <> uid
        and m.removed_at is null and not m.blocked
    ) then raise exception 'owner_must_transfer' using errcode = 'P0001'; end if;
    update public.groups set owner_id = null, archived_at = now() where id = g.id;
    update public.join_codes set revoked_at = now() where join_codes.group_id = g.id and revoked_at is null;
  end if;
  update public.group_members set removed_at = now(), blocked = false
    where group_members.group_id = g.id and group_members.user_id = uid;
end $$;

revoke all on function public.revoke_code(uuid), public.regenerate_code(uuid), public.remove_member(uuid, uuid),
  public.allow_back(uuid, uuid), public.transfer_owner(uuid, uuid), public.leave_group(uuid) from public, anon;
grant execute on function public.revoke_code(uuid), public.regenerate_code(uuid), public.remove_member(uuid, uuid),
  public.allow_back(uuid, uuid), public.transfer_owner(uuid, uuid), public.leave_group(uuid) to authenticated;
commit;
