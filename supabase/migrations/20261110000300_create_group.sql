-- TEC-27 (P0-03): create_group(client_key, name). Needs public.require_profile() from TEC-26 (20261110000200).
begin;

-- 6 chars from A-Z and 2-9 without I, O, 0, 1 (32 symbols). Random bytes come from gen_random_uuid(),
-- which is cryptographically secure; 256 is a multiple of 32, so there is no modulo bias.
create function private.new_join_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  result text := '';
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;
revoke all on function private.new_join_code() from public, anon, authenticated;

create function public.create_group(p_client_key uuid, p_name text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_name text := trim(coalesce(p_name, ''));
  g public.groups;
  new_code text;
  new_expiry timestamptz := now() + interval '14 days';
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  perform public.require_profile();
  if p_client_key is null then
    raise exception 'client_key_required' using errcode = '22023';
  end if;
  if length(clean_name) not between 1 and 50 then
    raise exception 'invalid_name' using errcode = '22023', detail = 'Group name must be 1 to 50 characters.';
  end if;

  -- Serialize this person's creates so the 20-group limit and retries cannot race.
  perform 1 from public.profiles where id = uid for update;

  -- Retry with the same key: return the same group (and never count it against the limit again).
  select * into g from public.groups where client_key = p_client_key;
  if found then
    if g.owner_id <> uid then
      raise exception 'client_key_in_use' using errcode = '42501';
    end if;
  else
    if (select count(*) from public.group_members m join public.groups x on x.id = m.group_id
        where m.user_id = uid and m.removed_at is null and not m.blocked and x.archived_at is null) >= 20 then
      raise exception 'group_limit_reached' using errcode = '53400', detail = 'You can be in up to 20 groups.';
    end if;
    insert into public.groups (name, owner_id, client_key) values (clean_name, uid, p_client_key) returning * into g;
    insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
    -- Primary key on code keeps codes unique; on the rare clash, draw again.
    for i in 1..20 loop
      new_code := private.new_join_code();
      insert into public.join_codes (code, group_id, expires_at) values (new_code, g.id, new_expiry)
        on conflict (code) do nothing;
      exit when found;
      new_code := null;
    end loop;
    if new_code is null then
      raise exception 'code_generation_failed' using errcode = '55000';
    end if;
  end if;

  select code, expires_at into new_code, new_expiry from public.join_codes
    where group_id = g.id order by (revoked_at is null and expires_at > now()) desc, expires_at desc limit 1;
  return jsonb_build_object('group_id', g.id, 'code', new_code, 'expires_at', new_expiry);
end $$;

-- One active code per group, enforced by the database. Regenerate (Phase 1b) revokes before inserting.
create unique index one_active_code on public.join_codes(group_id) where revoked_at is null;

revoke all on function public.create_group(uuid, text) from public, anon;
grant execute on function public.create_group(uuid, text) to authenticated;
commit;
