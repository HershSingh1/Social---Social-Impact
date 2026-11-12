-- TEC-93 (P0-14 backend): catalog changes reach upcoming sent plans (spec-decision C6).
-- edit_plan (TEC-33) already covers the organizer's edits. This job covers the two fields the organizer can't
-- edit, which come from the listing:
--   * booking newly required            -> material: new revision, Going invitees (not the organizer) reconfirm
--   * booking requirement removed       -> minor: same revision
--   * any price change (higher, lower, unknown <-> known) -> minor: same revision
-- Minor changes update the current revision's snapshot and set plans.updated_at, which drives the "Updated" label.
-- A price change keeps what it was: price_snapshot gains "previous": {"kind","min","max"} next to the new
-- {"kind","min","max"}, so the notice can say "was $20, now $30". Only the latest change is kept.
-- Only sent plans that have not started and whose listing is still published are touched. Running it twice
-- in a row changes nothing the second time.
begin;

-- One plan. Returns true when something changed. Locks the plan row like edit_plan, so a cancel or an answer
-- in flight finishes first and the job then sees its result.
create function private.apply_listing_change(target uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  cur public.plan_revisions;
  e public.experiences;
  price_changed boolean;
  snap jsonb;
  rev integer;
begin
  select * into p from public.plans pl where pl.id = target and pl.state = 'sent' for update;
  if not found then return false; end if;
  select * into cur from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if cur.start_at <= now() then return false; end if;
  select * into e from public.experiences x where x.id = p.experience_id and x.status = 'published';
  if not found then return false; end if;

  price_changed := (cur.price_snapshot ->> 'kind') is distinct from e.price_kind
    or (cur.price_snapshot ->> 'min')::numeric is distinct from e.price_min
    or (cur.price_snapshot ->> 'max')::numeric is distinct from e.price_max;
  if not price_changed and cur.booking_required is not distinct from e.booking_required then return false; end if;

  snap := cur.price_snapshot;
  if price_changed then
    snap := jsonb_build_object('kind', e.price_kind, 'min', e.price_min, 'max', e.price_max,
      'previous', jsonb_build_object('kind', cur.price_snapshot -> 'kind',
                                     'min', cur.price_snapshot -> 'min', 'max', cur.price_snapshot -> 'max'));
  end if;

  if e.booking_required and not cur.booking_required then
    -- Material: everyone who said Going is asked again; Awaiting and Can't go stay as they are.
    rev := p.current_revision + 1;
    insert into public.plan_revisions (plan_id, revision, start_at, end_at, time_zone, meeting_point, note,
                                       price_snapshot, booking_required)
      values (p.id, rev, cur.start_at, cur.end_at, cur.time_zone, cur.meeting_point, cur.note, snap, true);
    update public.plans pl set current_revision = rev, updated_at = now() where pl.id = p.id;
    update public.rsvps r set status = 'needs_reconfirm'
      where r.plan_id = p.id and r.removed_at is null and r.status = 'going' and r.user_id <> p.organizer_id;
    update public.rsvps r set revision = rev where r.plan_id = p.id and r.user_id = p.organizer_id;
  else
    -- Minor: same revision, nobody's answer changes.
    update public.plan_revisions v set price_snapshot = snap, booking_required = e.booking_required
      where v.plan_id = p.id and v.revision = p.current_revision;
    update public.plans pl set updated_at = now() where pl.id = p.id;
  end if;
  return true;
end $$;
revoke all on function private.apply_listing_change(uuid) from public, anon, authenticated;

-- The job. Cron / service role only; clients get no execute grant. Returns how many plans changed.
create function public.apply_listing_changes() returns integer
language plpgsql security definer set search_path = '' as $$
declare t uuid; n integer := 0;
begin
  for t in
    select pl.id from public.plans pl
      join public.plan_revisions v on v.plan_id = pl.id and v.revision = pl.current_revision
      join public.experiences e on e.id = pl.experience_id
    where pl.state = 'sent' and v.start_at > now() and e.status = 'published'
      and ((v.price_snapshot ->> 'kind') is distinct from e.price_kind
        or (v.price_snapshot ->> 'min')::numeric is distinct from e.price_min
        or (v.price_snapshot ->> 'max')::numeric is distinct from e.price_max
        or v.booking_required is distinct from e.booking_required)
    order by pl.id
  loop
    if private.apply_listing_change(t) then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.apply_listing_changes() from public, anon, authenticated;

-- Every minute. Skipped where pg_cron isn't installed (local pgTAP runner); enable it on Supabase.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('apply-listing-changes', '* * * * *', 'select public.apply_listing_changes()');
  else
    raise notice 'pg_cron not available: apply-listing-changes not scheduled';
  end if;
end $$;
commit;
