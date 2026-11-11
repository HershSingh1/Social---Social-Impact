-- TEC-33 (P0-14 backend): edit_plan(plan_id, changes). Material edits create a revision and flip Going to
-- Needs reconfirmation; a note-only edit keeps the revision. Catalog-driven price and booking changes are
-- out of scope (spec-decision C6); "venue" means the meeting point (C7).
begin;

-- Wall-clock America/Chicago -> UTC. Rejects times that fall in the spring-forward gap (rule 4).
-- send_plan will need the same conversion, so it lives here as a shared helper.
create function private.local_to_utc(local_ts timestamp)
returns timestamptz language plpgsql immutable set search_path = '' as $$
declare utc timestamptz := local_ts at time zone 'America/Chicago';
begin
  if (utc at time zone 'America/Chicago') <> local_ts then
    raise exception 'nonexistent_local_time' using errcode = 'P0001';
  end if;
  return utc;
end $$;
revoke all on function private.local_to_utc(timestamp) from public, anon, authenticated;

-- changes: any of start_local, end_local ("YYYY-MM-DDTHH:MM[:SS]", no offset, America/Chicago),
-- meeting_point, note (null clears). Returns {material, changed[], revision, needs_reconfirm}.
-- A field set to its current value is not a change.
create function public.edit_plan(plan_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.plans;
  cur public.plan_revisions;
  new_start timestamptz;
  new_end timestamptz;
  new_point text;
  new_note text;
  k text;
  diff text[] := '{}';
  is_material boolean;
  note_changed boolean;
  flipped integer := 0;
  rev integer;
  ts_re constant text := '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$';
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if changes is null or jsonb_typeof(changes) <> 'object' then
    raise exception 'invalid_changes' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(changes) loop
    if k not in ('start_local', 'end_local', 'meeting_point', 'note') then
      raise exception 'invalid_changes' using errcode = 'P0001';
    end if;
  end loop;

  -- Row lock: a cancel or an answer in flight finishes first, then we see its result.
  select * into p from public.plans pl where pl.id = edit_plan.plan_id for update;
  if not found or p.state = 'draft' or p.organizer_id <> uid then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select * into cur from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if cur.start_at <= now() then raise exception 'plan_started' using errcode = 'P0001'; end if;

  new_start := cur.start_at; new_end := cur.end_at; new_point := cur.meeting_point; new_note := cur.note;
  if changes ? 'start_local' then
    if jsonb_typeof(changes -> 'start_local') <> 'string' or changes ->> 'start_local' !~ ts_re then
      raise exception 'invalid_changes' using errcode = 'P0001';
    end if;
    new_start := private.local_to_utc((changes ->> 'start_local')::timestamp);
  end if;
  if changes ? 'end_local' then
    if jsonb_typeof(changes -> 'end_local') <> 'string' or changes ->> 'end_local' !~ ts_re then
      raise exception 'invalid_changes' using errcode = 'P0001';
    end if;
    new_end := private.local_to_utc((changes ->> 'end_local')::timestamp);
  end if;
  if changes ? 'meeting_point' then
    if jsonb_typeof(changes -> 'meeting_point') <> 'string' or btrim(changes ->> 'meeting_point') = '' then
      raise exception 'invalid_changes' using errcode = 'P0001';
    end if;
    new_point := btrim(changes ->> 'meeting_point');
  end if;
  if changes ? 'note' then
    if jsonb_typeof(changes -> 'note') not in ('string', 'null') then
      raise exception 'invalid_changes' using errcode = 'P0001';
    end if;
    new_note := changes ->> 'note';
  end if;
  if new_end <= new_start or new_start <= now() then
    raise exception 'invalid_times' using errcode = 'P0001';
  end if;

  if new_start <> cur.start_at then diff := array_append(diff, 'start_local'); end if;
  if new_end <> cur.end_at then diff := array_append(diff, 'end_local'); end if;
  if new_point <> cur.meeting_point then diff := array_append(diff, 'meeting_point'); end if;
  is_material := cardinality(diff) > 0;
  note_changed := new_note is distinct from cur.note;
  if note_changed then diff := array_append(diff, 'note'); end if;

  rev := p.current_revision;
  if is_material then
    rev := p.current_revision + 1;
    insert into public.plan_revisions (plan_id, revision, start_at, end_at, time_zone, meeting_point, note,
                                       price_snapshot, booking_required)
      values (p.id, rev, new_start, new_end, cur.time_zone, new_point, new_note, cur.price_snapshot, cur.booking_required);
    update public.plans pl set current_revision = rev, updated_at = now() where pl.id = p.id;
    update public.rsvps r set status = 'needs_reconfirm'
      where r.plan_id = p.id and r.removed_at is null and r.status = 'going' and r.user_id <> p.organizer_id;
    get diagnostics flipped = row_count;
    -- The organizer stays Going, now on the new revision.
    update public.rsvps r set revision = rev where r.plan_id = p.id and r.user_id = p.organizer_id;
  elsif note_changed then
    update public.plan_revisions v set note = new_note where v.plan_id = p.id and v.revision = p.current_revision;
    update public.plans pl set updated_at = now() where pl.id = p.id;
  end if;

  return jsonb_build_object('material', is_material, 'changed', to_jsonb(diff),
                            'revision', rev, 'needs_reconfirm', flipped);
end $$;
revoke all on function public.edit_plan(uuid, jsonb) from public, anon;
grant execute on function public.edit_plan(uuid, jsonb) to authenticated;
commit;
