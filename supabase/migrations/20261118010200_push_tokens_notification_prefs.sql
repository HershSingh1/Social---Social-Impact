-- TEC-130 (P1-04 backend 1 of 3, decision N4): push tokens and notification preferences.
-- Sending comes later (outbox and notify function). Tokens and prefs are private to the person and never logged.
begin;

-- The seven rows of the P1-04 table. A new kind means a new migration that replaces this function.
create function private.notification_kinds() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'plan_sent', 'pick_opened', 'pick_closing', 'pick_result',
    'material_change', 'cancellation', 'organizer_nudge'
  ]
$$;
revoke all on function private.notification_kinds() from public, anon, authenticated;

create table public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null check (length(token) between 1 and 512),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index push_tokens_token on public.push_tokens(token);

-- Owner-only reads. The sender uses the service role, which bypasses RLS.
alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from public, anon, authenticated;
grant select on table public.push_tokens to authenticated;
create policy own_push_tokens on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

-- A missing row means enabled, so this table only ever holds what the person chose.
create table public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind = any (private.notification_kinds())),
  enabled boolean not null,
  primary key (user_id, kind)
);

alter table public.notification_prefs enable row level security;
revoke all on table public.notification_prefs from public, anon, authenticated;
grant select on table public.notification_prefs to authenticated;
create policy own_notification_prefs on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

-- Registering the same token again changes nothing. A token already held by someone else moves to
-- the caller, because a phone only ever belongs to whoever is signed in on it now.
create function public.register_push_token(token text, platform text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  if register_push_token.token is null or length(register_push_token.token) not between 1 and 512 then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if register_push_token.platform is null or register_push_token.platform not in ('ios', 'android') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  delete from public.push_tokens t
    where t.token = register_push_token.token and t.user_id <> uid;
  insert into public.push_tokens (user_id, token, platform)
    values (uid, register_push_token.token, register_push_token.platform)
    on conflict on constraint push_tokens_pkey do update set platform = excluded.platform;
end $$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Deletes only the caller's row; removing a token that is not there is accepted.
create function public.remove_push_token(token text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  delete from public.push_tokens t
    where t.user_id = uid and t.token = remove_push_token.token;
end $$;
revoke all on function public.remove_push_token(text) from public, anon;
grant execute on function public.remove_push_token(text) to authenticated;

create function public.set_notification_pref(kind text, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  if set_notification_pref.kind is null or set_notification_pref.kind <> all (private.notification_kinds()) then
    raise exception 'unknown_kind' using errcode = '22023';
  end if;
  if set_notification_pref.enabled is null then
    raise exception 'invalid_enabled' using errcode = '22023';
  end if;

  insert into public.notification_prefs (user_id, kind, enabled)
    values (uid, set_notification_pref.kind, set_notification_pref.enabled)
    on conflict on constraint notification_prefs_pkey do update set enabled = excluded.enabled;
end $$;
revoke all on function public.set_notification_pref(text, boolean) from public, anon;
grant execute on function public.set_notification_pref(text, boolean) to authenticated;

commit;
