-- TEC-91 (P0-13 backend): add or remove invitees, and one join link per plan.
-- A link lets someone outside the group answer this one plan. It never creates a group_members row.
begin;

-- One live link per plan, kept in the private schema: clients never read tokens through RLS.
-- Only create_plan_link hands one back, and only to the organizer.
create table private.plan_links (
  token text primary key, plan_id uuid not null references public.plans(id),
  created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index one_live_plan_link on private.plan_links(plan_id) where revoked_at is null;
revoke all on table private.plan_links from public, anon, authenticated;

-- The plan row lock matches respond(): a cancel that commits first wins, so nothing here
-- adds people to, or reopens, a cancelled plan.
create function private.organizer_plan(target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  ends timestamptz;
begin
  select * into p from public.plans pl where pl.id = target for update;
  -- Same error for a missing plan, a draft, and a plan the caller does not organize.
  if not found or p.state = 'draft' or p.organizer_id <> (select auth.uid()) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select v.end_at into ends from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if ends <= now() then raise exception 'plan_ended' using errcode = 'P0001'; end if;
  return p.id;
end $$;
revoke all on function private.organizer_plan(uuid) from public, anon, authenticated;

-- Group members start as Awaiting reply on the current revision. A person the organizer removed
-- earlier is added back the same way. Anyone already invited is left alone.
create function public.add_invitees(plan_id uuid, user_ids uuid[])
returns table (going integer, awaiting integer, cant_go integer, needs_reconfirm integer)
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  who uuid;
begin
  perform public.require_profile();
  select * into p from public.plans pl where pl.id = private.organizer_plan(add_invitees.plan_id);
  foreach who in array coalesce((select array_agg(distinct u order by u) from unnest(user_ids) u where u is not null), '{}') loop
    if p.group_id is null or not exists (
      select 1 from public.group_members m where m.group_id = p.group_id and m.user_id = who
        and m.removed_at is null and not m.blocked) then
      raise exception 'recipient_not_a_member' using errcode = 'P0001';
    end if;
    insert into public.rsvps as r (plan_id, user_id, status, revision)
      values (p.id, who, 'awaiting', p.current_revision)
      on conflict on constraint rsvps_pkey do update
        set status = 'awaiting', revision = p.current_revision, removed_at = null
        where r.removed_at is not null;
  end loop;
  return query select * from private.rsvp_counts(p.id);
end $$;
revoke all on function public.add_invitees(uuid, uuid[]) from public, anon;
grant execute on function public.add_invitees(uuid, uuid[]) to authenticated;

-- Ends the person's access and drops them from the counts. The row stays, marked removed.
-- Removing someone who is already removed does nothing; a person who never was invited is not_invited.
create function public.remove_invitee(plan_id uuid, user_id uuid)
returns table (going integer, awaiting integer, cant_go integer, needs_reconfirm integer)
language plpgsql security definer set search_path = '' as $$
declare p public.plans;
begin
  perform public.require_profile();
  select * into p from public.plans pl where pl.id = private.organizer_plan(remove_invitee.plan_id);
  if remove_invitee.user_id is not distinct from p.organizer_id then
    raise exception 'cannot_remove_organizer' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = remove_invitee.user_id) then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;
  update public.rsvps r set removed_at = now()
    where r.plan_id = p.id and r.user_id = remove_invitee.user_id and r.removed_at is null;
  return query select * from private.rsvp_counts(p.id);
end $$;
revoke all on function public.remove_invitee(uuid, uuid) from public, anon;
grant execute on function public.remove_invitee(uuid, uuid) to authenticated;

-- Returns the plan's live link, making one if there is none, so a retry returns the same token.
create function public.create_plan_link(plan_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  tok text;
begin
  perform public.require_profile();
  select * into p from public.plans pl where pl.id = private.organizer_plan(create_plan_link.plan_id);
  select l.token into tok from private.plan_links l where l.plan_id = p.id and l.revoked_at is null;
  if found then return tok; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.plan_links (token, plan_id) values (tok, p.id);
  return tok;
end $$;
revoke all on function public.create_plan_link(uuid) from public, anon;
grant execute on function public.create_plan_link(uuid) to authenticated;

-- Stops new joins. People already in the plan stay in. Revoking twice does nothing.
create function public.revoke_plan_link(plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_profile();
  if not exists (select 1 from public.plans pl where pl.id = revoke_plan_link.plan_id
                 and pl.organizer_id = (select auth.uid()) and pl.state <> 'draft') then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  update private.plan_links l set revoked_at = now()
    where l.plan_id = revoke_plan_link.plan_id and l.revoked_at is null;
end $$;
revoke all on function public.revoke_plan_link(uuid) from public, anon;
grant execute on function public.revoke_plan_link(uuid) to authenticated;

-- A link works while it is live, the plan is sent and the plan has not ended. Every other case
-- is one error, so a token reveals nothing about plans it does not open.
create function private.open_plan_link(tok text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  ends timestamptz;
begin
  select pl.* into p from private.plan_links l join public.plans pl on pl.id = l.plan_id
    where l.token = tok and l.revoked_at is null and pl.state = 'sent' for update of pl;
  if found then
    select v.end_at into ends from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  end if;
  if not found or ends <= now() then raise exception 'link_unavailable' using errcode = 'P0001'; end if;
  return p.id;
end $$;
revoke all on function private.open_plan_link(text) from public, anon, authenticated;

-- Shows the activity, who invited you, the group, the time, price and booking. Never the
-- attendees, the note or the meeting point.
create function public.preview_plan_link(token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  rev public.plan_revisions;
  uid uuid;
begin
  uid := public.require_profile();
  select * into p from public.plans pl where pl.id = private.open_plan_link(preview_plan_link.token);
  select * into rev from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  return jsonb_build_object(
    'activity', p.experience_name, 'category', p.experience_category,
    'inviter', (select pr.display_name from public.profiles pr where pr.id = p.organizer_id),
    'group', (select g.name from public.groups g where g.id = p.group_id),
    'start_at', rev.start_at, 'end_at', rev.end_at, 'time_zone', rev.time_zone,
    'price', rev.price_snapshot, 'booking_required', rev.booking_required,
    'already_joined', exists (select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = uid and r.removed_at is null));
end $$;
revoke all on function public.preview_plan_link(text) from public, anon;
grant execute on function public.preview_plan_link(text) to authenticated;

-- Adds the caller to this plan as Awaiting reply. Joining again does nothing. Someone the
-- organizer removed cannot rejoin by link; the organizer can add them back. Returns the plan id.
create function public.join_plan(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.plans;
  existing public.rsvps;
begin
  uid := public.require_profile();
  select * into p from public.plans pl where pl.id = private.open_plan_link(join_plan.token);
  select * into existing from public.rsvps r where r.plan_id = p.id and r.user_id = uid;
  if found then
    if existing.removed_at is not null then raise exception 'removed_from_plan' using errcode = 'P0001'; end if;
    return p.id;
  end if;
  -- A person the group blocked is not let in through a side door.
  if exists (select 1 from public.group_members m where m.group_id = p.group_id and m.user_id = uid and m.blocked) then
    raise exception 'link_unavailable' using errcode = 'P0001';
  end if;
  insert into public.rsvps (plan_id, user_id, status, revision) values (p.id, uid, 'awaiting', p.current_revision);
  return p.id;
end $$;
revoke all on function public.join_plan(text) from public, anon;
grant execute on function public.join_plan(text) to authenticated;
commit;
