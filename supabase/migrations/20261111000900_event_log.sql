-- TEC-101 (G3): analytics event log. Insert-only through log_event; no client can read any events.
begin;

-- user_id is set to null when the account is deleted, so past events stay countable but are no longer
-- tied to a person.
create table public.events (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  name text not null, props jsonb not null default '{}', created_at timestamptz not null default now()
);
create index events_user_recent on public.events(user_id, created_at);
alter table public.events enable row level security;
revoke all on table public.events from public, anon, authenticated;

-- Keeps only the properties on the allowlist, and only values of the expected shape. Everything else is
-- dropped without an error: notes, contacts, calendar contents, budgets, photos and invite codes have no
-- key here, and a value in the wrong shape (an invite code in plan_id, say) is dropped with its key.
create function private.clean_event_props(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  out jsonb := '{}';
  k text;
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return out; end if;
  for k, v in select * from jsonb_each(p) loop
    if k in ('experience_id', 'pick_id', 'option_id', 'plan_id', 'group_id') then
      if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        out := out || jsonb_build_object(k, v);
      end if;
    elsif k = 'value' then
      if v in ('"yes"', '"maybe"', '"no"') then out := out || jsonb_build_object(k, v); end if;
    elsif k = 'status' then
      if v in ('"going"', '"cant_go"') then out := out || jsonb_build_object(k, v); end if;
    elsif k = 'material' then
      if jsonb_typeof(v) = 'boolean' then out := out || jsonb_build_object(k, v); end if;
    elsif k = 'surface' then
      if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z_]{1,32}$' then out := out || jsonb_build_object(k, v); end if;
    elsif k = 'changed' then
      -- Names of the fields that changed, never their contents.
      if jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 4
         and not exists (select 1 from jsonb_array_elements(v) x
                         where x not in ('"start_local"', '"end_local"', '"meeting_point"', '"note"')) then
        out := out || jsonb_build_object(k, v);
      end if;
    end if;
  end loop;
  return out;
end $$;
revoke all on function private.clean_event_props(jsonb) from public, anon, authenticated;

-- name: one of the Phase 1 events from the spec; anything else is unknown_event. Later phases add their
-- names here. A person is capped at 1,000 events an hour; past that, events are dropped without an error
-- so logging never breaks a screen.
create function public.log_event(name text, props jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if log_event.name is null or log_event.name not in ('experience_viewed', 'pick_created', 'vote_cast', 'pick_closed',
      'plan_drafted', 'plan_sent', 'invite_viewed', 'rsvp_saved', 'plan_edited', 'plan_cancelled') then
    raise exception 'unknown_event' using errcode = 'P0001';
  end if;
  if (select count(*) from public.events e where e.user_id = uid and e.created_at > now() - interval '1 hour') >= 1000 then
    return;
  end if;
  insert into public.events (user_id, name, props) values (uid, log_event.name, private.clean_event_props(log_event.props));
end $$;
revoke all on function public.log_event(text, jsonb) from public, anon;
grant execute on function public.log_event(text, jsonb) to authenticated;
commit;
