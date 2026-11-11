-- TEC-27 (P0-03 backend): create_group(client_key, name) with join code generation.
begin;

-- One active (unrevoked) code per group. Codes are globally unique via the primary key.
create unique index join_codes_one_active on public.join_codes(group_id) where revoked_at is null;

-- 6 chars from A-Z and 2-9 without 0, O, 1, I. random() is enough for a 14-day invite code
-- (join attempts are rate limited in join_attempts).
create function private.generate_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;
revoke all on function private.generate_join_code() from public, anon, authenticated;

create function public.create_group(client_key uuid, name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  clean text := trim(create_group.name);
  g public.groups;
  c public.join_codes;
  n int;
begin
  if client_key is null then raise exception 'invalid_client_key' using errcode = 'P0001'; end if;
  if clean is null or length(clean) not between 1 and 50 then
    raise exception 'invalid_group_name' using errcode = 'P0001';
  end if;

  -- Serialize this person's creates so the limit and retries cannot race.
  perform pg_advisory_xact_lock(hashtextextended('create_group:' || uid::text, 0));

  select * into g from public.groups x where x.client_key = create_group.client_key;
  if found then
    if g.owner_id <> uid then raise exception 'client_key_conflict' using errcode = 'P0001'; end if;
    select * into c from public.join_codes j where j.group_id = g.id and j.revoked_at is null;
    return jsonb_build_object('group_id', g.id, 'code', c.code, 'expires_at', c.expires_at);
  end if;

  select count(*) into n from public.group_members m join public.groups x on x.id = m.group_id
    where m.user_id = uid and m.removed_at is null and not m.blocked and x.archived_at is null;
  if n >= 20 then raise exception 'group_limit_reached' using errcode = 'P0001'; end if;

  insert into public.groups (name, owner_id, client_key) values (clean, uid, create_group.client_key)
    returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');

  for n in 1..20 loop
    begin
      insert into public.join_codes (code, group_id, expires_at)
        values (private.generate_join_code(), g.id, now() + interval '14 days') returning * into c;
      exit;
    exception when unique_violation then
      if n = 20 then raise exception 'code_generation_failed' using errcode = 'P0001'; end if;
    end;
  end loop;

  return jsonb_build_object('group_id', g.id, 'code', c.code, 'expires_at', c.expires_at);
end $$;
revoke all on function public.create_group(uuid, text) from public, anon;
grant execute on function public.create_group(uuid, text) to authenticated;
commit;
