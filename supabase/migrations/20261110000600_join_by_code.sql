-- TEC-25 (P0-01 backend): preview_group_code and join_group with a 5-wrong-tries-per-minute limit.
-- Both RPCs return a jsonb result instead of raising, so the failed-attempt counter commits.
-- Raw codes are never logged or stored in join_attempts (counters only).
begin;

-- Shared check for preview and join. Applies the throttle, then looks the code up.
-- Returns (err, gid): err is null when the code is good. Wrong and expired codes count as failed tries.
create function private.check_join_code(uid uuid, raw text, out err text, out gid uuid)
language plpgsql security definer set search_path = '' as $$
declare
  norm text := upper(trim(coalesce(raw, '')));
  a public.join_attempts;
begin
  insert into public.join_attempts (user_id, window_start) values (uid, now()) on conflict (user_id) do nothing;
  select * into a from public.join_attempts where user_id = uid for update;
  if a.blocked_until is not null and a.blocked_until > now() then
    err := 'too_many_tries'; return;
  end if;
  if a.window_start <= now() - interval '1 minute' or a.blocked_until is not null then
    update public.join_attempts set window_start = now(), attempts = 0, blocked_until = null where user_id = uid;
    a.attempts := 0;
  end if;

  select c.group_id,
         case when c.expires_at <= now() or c.revoked_at is not null or g.archived_at is not null
              then 'expired' end
    into gid, err
    from public.join_codes c join public.groups g on g.id = c.group_id
    where c.code = norm;
  if not found then err := 'wrong_code'; end if;

  if err is not null then
    gid := null;
    update public.join_attempts set attempts = a.attempts + 1,
      blocked_until = case when a.attempts + 1 >= 5 then now() + interval '1 minute' end
      where user_id = uid;
  end if;
end $$;
revoke all on function private.check_join_code(uuid, text) from public, anon, authenticated;

create function public.preview_group_code(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  r record;
begin
  select * into r from private.check_join_code(uid, code);
  if r.err is not null then return jsonb_build_object('ok', false, 'error', r.err); end if;
  -- Group name and owner name only; no roster.
  return (select jsonb_build_object('ok', true, 'group_name', g.name, 'owner_name', p.display_name,
      'already_member', exists (select 1 from public.group_members m
        where m.group_id = g.id and m.user_id = uid and m.removed_at is null and not m.blocked))
    from public.groups g join public.profiles p on p.id = g.owner_id where g.id = r.gid);
end $$;

create function public.join_group(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  r record;
  m public.group_members;
begin
  select * into r from private.check_join_code(uid, code);
  if r.err is not null then return jsonb_build_object('ok', false, 'error', r.err); end if;

  -- Serialize joins per group so the 30-member cap cannot be raced past.
  perform 1 from public.groups where id = r.gid for update;
  select * into m from public.group_members where group_id = r.gid and user_id = uid;
  if found and m.removed_at is null and not m.blocked then
    return jsonb_build_object('ok', true, 'group_id', r.gid, 'already_member', true);
  end if;
  if found and m.blocked then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  if (select count(*) from public.group_members where group_id = r.gid and removed_at is null and not blocked) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'group_full');
  end if;
  if (select count(*) from public.group_members where user_id = uid and removed_at is null and not blocked) >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many_groups');
  end if;
  -- A row with removed_at set and not blocked is someone who left; they may rejoin.
  insert into public.group_members (group_id, user_id) values (r.gid, uid)
    on conflict (group_id, user_id) do update set removed_at = null, joined_at = now();
  return jsonb_build_object('ok', true, 'group_id', r.gid, 'already_member', false);
end $$;

revoke all on function public.preview_group_code(text), public.join_group(text) from public, anon;
grant execute on function public.preview_group_code(text), public.join_group(text) to authenticated;
commit;
