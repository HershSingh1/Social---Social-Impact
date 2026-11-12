-- TEC-95 (P0-15 backend): cancel_plan(plan_id, reason).
begin;

-- The organizer cancels a sent plan. reason is Weather, Not enough people or Venue closed (any capitalisation,
-- stored as written here), or free text for "Other" (1 to 200 characters; the bare word Other needs text).
-- The text is what invitees read after "Maya cancelled this plan:". Invitees keep their RSVP rows and can still
-- open the plan; respond and edit_plan already refuse a cancelled plan with plan_cancelled.
-- Cancelling twice does nothing and keeps the first reason, so a retry is safe. A plan that has already
-- ended can't be cancelled; one that is under way can.
create function public.cancel_plan(plan_id uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  ends timestamptz;
  why text := btrim(coalesce(reason, ''));
begin
  perform public.require_profile();
  why := case lower(why)
    when 'weather' then 'Weather'
    when 'not enough people' then 'Not enough people'
    when 'venue closed' then 'Venue closed'
    else why end;
  if length(why) not between 1 and 200 or lower(why) = 'other' then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  -- Row lock, the same one respond and edit_plan take. An answer or edit that holds it finishes first and
  -- this cancel then wins; one that waits behind us sees plan_cancelled. Either way the plan ends cancelled.
  select * into p from public.plans pl where pl.id = cancel_plan.plan_id for update;
  -- Same error for a missing plan, a draft, and a plan the caller does not organize.
  if not found or p.state = 'draft' or p.organizer_id is distinct from (select auth.uid()) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then return; end if;
  select v.end_at into ends from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if ends <= now() then raise exception 'plan_ended' using errcode = 'P0001'; end if;
  update public.plans pl set state = 'cancelled', cancel_reason = why, updated_at = now() where pl.id = p.id;
end $$;
revoke all on function public.cancel_plan(uuid, text) from public, anon;
grant execute on function public.cancel_plan(uuid, text) to authenticated;
commit;
