-- TEC-89 (P0-11 backend): session times and the unconfirmed-info flag.
--   * experiences.sessions holds the listed session times, [{start_local, end_local}] in America/Chicago (G6).
--     They are shown, not enforced: send_plan accepts any time, so fixed-time activities can be planned.
--   * Booking can be unknown (G15): experiences.booking_required and plan_revisions.booking_required are
--     nullable, NULL meaning unknown. The plan keeps "unknown" so invitees see it as unconfirmed.
--   * send_plan refuses an unknown price (price_kind = 'unknown') or unknown booking unless the organizer
--     ticked "I understand the price/booking is unconfirmed" (acknowledged => true).
--   * apply_listing_changes: booking going from unknown to required is a newly required booking (material).
begin;

alter table public.experiences alter column booking_required drop not null;
alter table public.plan_revisions alter column booking_required drop not null;

-- 1 to 50 sessions, each {"start_local": "YYYY-MM-DDTHH:MM[:SS]", "end_local": ...} ending after it starts.
-- Same rule suggest_listing already applies to suggestions.
create function private.valid_sessions(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(s) = 'array' and jsonb_array_length(s) between 1 and 50
    and not exists (select 1 from jsonb_array_elements(s) x
      where jsonb_typeof(x) <> 'object'
         or coalesce((x ->> 'start_local') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$', true)
         or coalesce((x ->> 'end_local') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$', true)
         or (x ->> 'end_local') <= (x ->> 'start_local'))
$$;
alter table public.experiences add constraint experiences_sessions_shape
  check (sessions is null or private.valid_sessions(sessions));

-- send_plan gains acknowledged (last, default false), so existing named-argument callers keep working.
-- acknowledged is not part of the client_key payload: it doesn't change the plan, and a retry of a sent
-- plan returns it whatever the flag says.
drop function public.send_plan(uuid, uuid, uuid, text, text, text, text, uuid[], uuid, text);
create function public.send_plan(client_key uuid, group_id uuid, experience_id uuid, start_local text,
  end_local text, meeting_point text, note text default null, recipients uuid[] default '{}',
  pick_id uuid default null, time_zone text default 'America/Chicago', acknowledged boolean default false)
  returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  ex public.experiences;
  pk public.picks;
  req private.send_plan_requests;
  point text;
  note_text text;
  start_utc timestamptz;
  end_utc timestamptz;
  invitees uuid[];
  who uuid;
  pid uuid;
  hash text;
  ts_re constant text := '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$';
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if client_key is null then raise exception 'invalid_client_key' using errcode = 'P0001'; end if;
  if time_zone is distinct from 'America/Chicago' then raise exception 'invalid_time_zone' using errcode = 'P0001'; end if;
  point := btrim(coalesce(meeting_point, ''));
  note_text := nullif(btrim(coalesce(note, '')), '');
  invitees := coalesce((select array_agg(distinct r order by r) from unnest(recipients) r where r is not null and r <> uid), '{}');
  hash := md5(jsonb_build_array(group_id, experience_id, start_local, end_local, point, note_text,
                                invitees, pick_id, time_zone)::text);

  -- Same-key calls run one at a time, so the second sees the first's plan instead of racing it.
  perform pg_advisory_xact_lock(hashtextextended('send_plan:' || client_key::text, 0));
  select * into req from private.send_plan_requests r where r.client_key = send_plan.client_key;
  if found then
    if req.user_id <> uid or req.payload_hash <> hash then raise exception 'client_key_conflict' using errcode = 'P0001'; end if;
    return req.plan_id;
  end if;

  if not private.is_group_member(group_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if exists (select 1 from public.groups g where g.id = send_plan.group_id and g.archived_at is not null) then
    raise exception 'group_archived' using errcode = 'P0001';
  end if;
  select * into ex from public.experiences e where e.id = send_plan.experience_id and e.status = 'published';
  if not found then raise exception 'experience_not_found' using errcode = 'P0001'; end if;
  if (ex.price_kind = 'unknown' or ex.booking_required is null) and acknowledged is not true then
    raise exception 'unconfirmed_info_not_acknowledged' using errcode = 'P0001';
  end if;
  if length(point) not between 1 and 200 then raise exception 'invalid_meeting_point' using errcode = 'P0001'; end if;
  if length(note_text) > 500 then raise exception 'invalid_note' using errcode = 'P0001'; end if;
  if start_local is null or end_local is null or start_local !~ ts_re or end_local !~ ts_re then
    raise exception 'invalid_times' using errcode = 'P0001';
  end if;
  start_utc := private.local_to_utc(start_local::timestamp);
  end_utc := private.local_to_utc(end_local::timestamp);
  if start_utc <= now() or end_utc <= start_utc then raise exception 'invalid_times' using errcode = 'P0001'; end if;
  foreach who in array invitees loop
    if not exists (select 1 from public.group_members m where m.group_id = send_plan.group_id and m.user_id = who
                   and m.removed_at is null and not m.blocked) then
      raise exception 'recipient_not_a_member' using errcode = 'P0001';
    end if;
  end loop;

  if pick_id is not null then
    -- Lock the pick: two plans from one pick can't both pass the state check.
    select * into pk from public.picks p where p.id = send_plan.pick_id and p.group_id = send_plan.group_id for update;
    if not found then raise exception 'pick_not_found' using errcode = 'P0001'; end if;
    if pk.organizer_id <> uid then raise exception 'not_organizer' using errcode = '42501'; end if;
    if pk.state = 'planned' then raise exception 'pick_already_planned' using errcode = 'P0001'; end if;
    if pk.state <> 'closed' then raise exception 'pick_not_closed' using errcode = 'P0001'; end if;
  end if;

  insert into public.plans (group_id, organizer_id, experience_id, experience_name, experience_category,
                            pick_id, state, current_revision, client_key)
    values (group_id, uid, ex.id, ex.name, ex.category, pick_id, 'sent', 1, client_key) returning id into pid;
  insert into public.plan_revisions (plan_id, revision, start_at, end_at, time_zone, meeting_point, note,
                                     price_snapshot, booking_required)
    values (pid, 1, start_utc, end_utc, time_zone, point, note_text,
            jsonb_build_object('kind', ex.price_kind, 'min', ex.price_min, 'max', ex.price_max), ex.booking_required);
  insert into public.rsvps (plan_id, user_id, status, revision) values (pid, uid, 'going', 1);
  insert into public.rsvps (plan_id, user_id, status, revision)
    select pid, r, 'awaiting', 1 from unnest(invitees) r;
  if pick_id is not null then update public.picks p set state = 'planned' where p.id = pk.id; end if;
  insert into private.send_plan_requests (client_key, user_id, plan_id, payload_hash) values (client_key, uid, pid, hash);
  return pid;
end $$;
revoke all on function public.send_plan(uuid, uuid, uuid, text, text, text, text, uuid[], uuid, text, boolean) from public, anon;
grant execute on function public.send_plan(uuid, uuid, uuid, text, text, text, text, uuid[], uuid, text, boolean) to authenticated;

-- Same as TEC-93's version except the material test: a plan that showed booking as not needed or unknown
-- (cur.booking_required is not true) and now requires it gets a new revision.
create or replace function private.apply_listing_change(target uuid) returns boolean
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

  if e.booking_required and cur.booking_required is not true then
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
commit;
