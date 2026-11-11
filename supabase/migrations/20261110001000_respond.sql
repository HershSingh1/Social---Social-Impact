-- TEC-32 (P0-13 backend): respond(plan_id, revision, status) with revision check.
begin;

-- Four counts for one plan (removed invitees excluded). Private: callers go through respond().
create function private.rsvp_counts(target uuid)
returns table (going integer, awaiting integer, cant_go integer, needs_reconfirm integer)
language sql stable security definer set search_path = '' as $$
  select (count(*) filter (where status = 'going'))::integer,
         (count(*) filter (where status = 'awaiting'))::integer,
         (count(*) filter (where status = 'cant_go'))::integer,
         (count(*) filter (where status = 'needs_reconfirm'))::integer
  from public.rsvps where plan_id = target and removed_at is null;
$$;
revoke all on function private.rsvp_counts(uuid) from public, anon, authenticated;

create function public.respond(plan_id uuid, revision integer, status text)
returns table (going integer, awaiting integer, cant_go integer, needs_reconfirm integer)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.plans;
  rev public.plan_revisions;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if respond.status is null or respond.status not in ('going', 'cant_go') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  -- Row lock: a cancel that commits first wins; one that waits on us then sees our answer.
  select * into p from public.plans pl where pl.id = respond.plan_id for update;
  -- Same error for a missing plan, a draft, and a plan the caller is not invited to.
  if not found or p.state = 'draft' or not exists (
    select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = uid and r.removed_at is null) then
    raise exception 'not_invited' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select * into rev from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if rev.start_at <= now() then raise exception 'answers_locked' using errcode = 'P0001'; end if;
  if respond.revision is distinct from p.current_revision then
    raise exception 'stale_revision' using errcode = 'P0001';
  end if;
  if p.organizer_id = uid and respond.status = 'cant_go' then
    raise exception 'organizer_cannot_decline' using errcode = 'P0001';
  end if;
  update public.rsvps r set status = respond.status, revision = p.current_revision
    where r.plan_id = p.id and r.user_id = uid;
  return query select * from private.rsvp_counts(p.id);
end $$;
revoke all on function public.respond(uuid, integer, text) from public, anon;
grant execute on function public.respond(uuid, integer, text) to authenticated;
commit;
