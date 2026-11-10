-- Account + group RPCs. Error convention (see docs/rpc.md): functions raise an exception whose MESSAGE is a
-- machine code (e.g. 'account_required'). The join-code functions instead RETURN {ok:false, error:'...'} for
-- the expected user-input failures, because a raised exception would roll back the failed-attempt row that
-- the rate limiter depends on.

-- ---------------------------------------------------------------- set_profile (helper, not in spec table)
-- Guests call this right after anonymous sign-in to store their display name.
create function public.set_profile(p_display_name text, p_avatar_path text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid_display_name'; end if;

  insert into public.profiles (id, display_name, avatar_path, is_guest)
  values (v_uid, v_name, p_avatar_path, not private.is_account())
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_path  = coalesce(excluded.avatar_path, public.profiles.avatar_path),
        is_guest     = excluded.is_guest;
end $$;

-- ---------------------------------------------------------------- create_group(name)
create function public.create_group(p_name text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_group uuid;
  v_code  text;
  v_exp   timestamptz := now() + interval '14 days';
  i       int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not private.is_account() then raise exception 'account_required'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'profile_required'; end if;
  if char_length(v_name) not between 1 and 50 then raise exception 'invalid_name'; end if;
  if (select count(*) from public.group_members where user_id = v_uid and removed_at is null) >= 20 then
    raise exception 'too_many_groups';
  end if;

  insert into public.groups (name, owner_id) values (v_name, v_uid) returning id into v_group;
  insert into public.group_members (group_id, user_id, role) values (v_group, v_uid, 'owner');

  for i in 1 .. 10 loop
    v_code := private.generate_code();
    begin
      insert into public.join_codes (code, group_id, expires_at) values (v_code, v_group, v_exp);
      exit;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  if v_code is null then raise exception 'code_generation_failed'; end if;

  return jsonb_build_object('group_id', v_group, 'code', v_code, 'expires_at', v_exp);
end $$;

-- ---------------------------------------------------------------- code lookup + rate limit (internal)
-- Returns {ok:true, group_id} or {ok:false, error: too_many_tries | wrong_code | expired}.
-- Only unknown/malformed codes count as failed tries. Limit: 5 per minute per user, 20 per minute per IP.
create function private.resolve_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_ip    text;
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_row   public.join_codes;
  v_user_fails int;
  v_ip_fails   int := 0;
begin
  v_ip := nullif(btrim(split_part(
            coalesce((nullif(current_setting('request.headers', true), '')::jsonb) ->> 'x-forwarded-for', ''),
            ',', 1)), '');

  delete from public.join_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_user_fails from public.join_attempts
   where user_id = v_uid and attempted_at > now() - interval '60 seconds';
  if v_ip is not null then
    select count(*) into v_ip_fails from public.join_attempts
     where ip = v_ip and attempted_at > now() - interval '60 seconds';
  end if;
  if v_user_fails >= 5 or v_ip_fails >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many_tries');
  end if;

  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
    insert into public.join_attempts (user_id, ip) values (v_uid, v_ip);
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;

  select * into v_row from public.join_codes where code = v_code;
  if not found then
    insert into public.join_attempts (user_id, ip) values (v_uid, v_ip);
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;

  -- expired and revoked look the same to the user: "This code has expired. Ask for a new one."
  if v_row.revoked_at is not null or v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  return jsonb_build_object('ok', true, 'group_id', v_row.group_id);
end $$;

-- ---------------------------------------------------------------- preview_group_code (helper)
-- P0-01 preview: group name and owner only. Never the member list. Opening it never adds anyone.
create function public.preview_group_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_group uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_res := private.resolve_code(p_code);
  if not (v_res ->> 'ok')::boolean then return v_res; end if;
  v_group := (v_res ->> 'group_id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'group_id', v_group,
    'group_name', (select name from public.groups where id = v_group),
    'owner_name', (select p.display_name from public.groups g join public.profiles p on p.id = g.owner_id
                    where g.id = v_group),
    'already_member', exists (select 1 from public.group_members
                               where group_id = v_group and user_id = v_uid
                                 and removed_at is null and not blocked));
end $$;

-- ---------------------------------------------------------------- join_group(code)
-- Guests and accounts. Needs a profile (set_profile) first so the roster can show a name.
create function public.join_group(p_code text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_res   jsonb;
  v_group public.groups;
  v_member public.group_members;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'profile_required'; end if;

  v_res := private.resolve_code(p_code);
  if not (v_res ->> 'ok')::boolean then return v_res; end if;

  -- lock the group row so the 30-member limit holds under concurrent joins
  select * into v_group from public.groups where id = (v_res ->> 'group_id')::uuid for update;
  if v_group.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select * into v_member from public.group_members where group_id = v_group.id and user_id = v_uid;
  if found then
    if v_member.blocked then
      return jsonb_build_object('ok', false, 'error', 'blocked');
    elsif v_member.removed_at is null then
      return jsonb_build_object('ok', true, 'status', 'already_member',
                                'group_id', v_group.id, 'group_name', v_group.name);
    end if;
  end if;

  if (select count(*) from public.group_members where group_id = v_group.id and removed_at is null) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'group_full');
  end if;
  if (select count(*) from public.group_members where user_id = v_uid and removed_at is null) >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many_groups');
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'member')
  on conflict (group_id, user_id) do update set removed_at = null, joined_at = now();

  return jsonb_build_object('ok', true, 'status', 'joined', 'group_id', v_group.id, 'group_name', v_group.name);
end $$;
