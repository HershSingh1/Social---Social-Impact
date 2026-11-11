-- TEC-31 (P0-12 backend): send_plan(client_key, ...). Creates a Sent plan at revision 1 with its
-- invitations, exactly once per client_key. Server drafts and fixed sessions are Phase 1b (C2, G6).
begin;

-- One row per accepted client_key, so a retry can be told apart from a reused key with a different
-- payload. Private: no client access, rows are written only by send_plan.
create table private.send_plan_requests (
  client_key uuid primary key, user_id uuid not null references public.profiles(id),
  plan_id uuid not null references public.plans(id), payload_hash text not null
);
revoke all on table private.send_plan_requests from public, anon, authenticated;

-- start_local / end_local: "YYYY-MM-DDTHH:MM[:SS]", no offset, in time_zone (America/Chicago only).
-- recipients: group member ids; the organizer is added automatically and duplicates are ignored.
-- pick_id: optional Closed pick of the same group, organizer only; it becomes Planned and plans.pick_id links back.
-- Returns the plan id. The same key and payload returns the same id; the same key with a different
-- payload (or from another user) is client_key_conflict.
create function public.send_plan(client_key uuid, group_id uuid, experience_id uuid, start_local text,
  end_local text, meeting_point text, note text default null, recipients uuid[] default '{}',
  pick_id uuid default null, time_zone text default 'America/Chicago') returns uuid
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
  if ex.timing_kind = 'fixed' then raise exception 'fixed_sessions_not_supported' using errcode = 'P0001'; end if;
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
revoke all on function public.send_plan(uuid, uuid, uuid, text, text, text, text, uuid[], uuid, text) from public, anon;
grant execute on function public.send_plan(uuid, uuid, uuid, text, text, text, text, uuid[], uuid, text) to authenticated;
commit;
