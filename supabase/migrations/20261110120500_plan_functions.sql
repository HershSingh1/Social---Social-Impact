-- Plan RPCs (P0-10 to P0-14). Times: the client sends WALL-CLOCK local time (timestamp without time zone) plus
-- the zone; the server converts to UTC, rejecting nonexistent DST local times (rule 4).
-- Cancel, add_invitees, plan links: pilot, not in this migration.

-- ---------------------------------------------------------------- send_plan
-- Creates exactly one plan in state 'sent', revision 1. Same p_client_key returns the same plan, so a retry
-- after a dropped connection never creates a second plan or a second invitation.
-- p_recipients: user ids of group members to invite (organizer is always included and always Going);
--               NULL = every other active member.
-- p_pick_id: set when the plan comes from a closed pick; marks that pick 'planned'.
create function public.send_plan(
  p_client_key    uuid,
  p_group_id      uuid,
  p_experience_id uuid,
  p_start_local   timestamp,
  p_end_local     timestamp,
  p_meeting_point text,
  p_note          text default null,
  p_recipients    uuid[] default null,
  p_pick_id       uuid default null,
  p_time_zone     text default 'America/Chicago')
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_exp     public.experiences;
  v_pick    public.picks;
  v_choice  uuid;
  v_start   timestamptz;
  v_end     timestamptz;
  v_meet    text := btrim(coalesce(p_meeting_point, ''));
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_rec     uuid[];
  v_plan    uuid;
  v_found   uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not private.is_account() then raise exception 'account_required'; end if;
  if p_client_key is null then raise exception 'client_key_required'; end if;

  -- retry of a send that already succeeded: return that plan
  select id into v_found from public.plans where client_key = p_client_key and organizer_id = v_uid;
  if found then return v_found; end if;
  if exists (select 1 from public.plans where client_key = p_client_key) then
    raise exception 'client_key_conflict';
  end if;

  if not private.is_member(p_group_id) then raise exception 'not_member'; end if;

  select * into v_exp from public.experiences where id = p_experience_id and status = 'active';
  if not found then raise exception 'experience_unavailable'; end if;
  -- Fixed-session validation needs the sessions JSON shape to be decided (pilot scope): refuse for now.
  if v_exp.timing_kind = 'fixed' then raise exception 'fixed_sessions_not_supported'; end if;

  v_start := private.local_to_utc(p_start_local, p_time_zone);
  v_end   := private.local_to_utc(p_end_local, p_time_zone);
  if v_start <= now() then raise exception 'start_in_past'; end if;
  if v_end <= v_start then raise exception 'end_before_start'; end if;
  if char_length(v_meet) not between 1 and 200 then raise exception 'invalid_meeting_point'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'invalid_note'; end if;

  if p_recipients is null then
    select coalesce(array_agg(user_id), '{}') into v_rec from public.group_members
     where group_id = p_group_id and removed_at is null and not blocked and user_id <> v_uid;
  else
    select coalesce(array_agg(distinct x), '{}') into v_rec from unnest(p_recipients) x where x <> v_uid;
    if exists (select 1 from unnest(v_rec) x
                where not exists (select 1 from public.group_members gm
                                   where gm.group_id = p_group_id and gm.user_id = x
                                     and gm.removed_at is null and not gm.blocked)) then
      raise exception 'recipient_not_member';
    end if;
  end if;

  if p_pick_id is not null then
    select * into v_pick from public.picks where id = p_pick_id for update;
    if not found or v_pick.group_id <> p_group_id then raise exception 'pick_not_found'; end if;
    if v_pick.organizer_id <> v_uid then raise exception 'not_organizer'; end if;
    if v_pick.state = 'planned' then raise exception 'pick_already_planned'; end if;
    if v_pick.state <> 'closed' then raise exception 'pick_not_closed'; end if;
    v_choice := coalesce(v_pick.override_option_id, v_pick.winner_option_id);
    if v_choice is null then raise exception 'pick_has_no_choice'; end if;
    if (select experience_id from public.pick_options where id = v_choice) <> p_experience_id then
      raise exception 'experience_mismatch';
    end if;
  end if;

  insert into public.plans (group_id, organizer_id, experience_id, pick_id, state, current_revision, client_key)
  values (p_group_id, v_uid, p_experience_id, p_pick_id, 'sent', 1, p_client_key)
  on conflict (client_key) do nothing
  returning id into v_plan;
  if v_plan is null then   -- a concurrent retry won the race
    select id into v_plan from public.plans where client_key = p_client_key and organizer_id = v_uid;
    if v_plan is null then raise exception 'client_key_conflict'; end if;
    return v_plan;
  end if;

  insert into public.plan_revisions
    (plan_id, revision, start_at, end_at, time_zone, meeting_point, note, price_snapshot, booking_required)
  values
    (v_plan, 1, v_start, v_end, p_time_zone, v_meet, v_note,
     jsonb_build_object('price_kind', v_exp.price_kind, 'price_min', v_exp.price_min, 'price_max', v_exp.price_max),
     v_exp.booking_required);

  insert into public.rsvps (plan_id, user_id, status, revision) values (v_plan, v_uid, 'going', 1);
  insert into public.rsvps (plan_id, user_id, status, revision)
  select v_plan, x, 'awaiting', 1 from unnest(v_rec) x;

  if p_pick_id is not null then
    update public.picks set state = 'planned' where id = p_pick_id;
  end if;

  return v_plan;
end $$;

-- ---------------------------------------------------------------- respond
-- Invitee answers Going / Can't go against a specific revision. Returns the new counts.
-- Order of checks: invitee, cancelled, stale_revision, answers_locked, organizer rule.
create function public.respond(p_plan_id uuid, p_revision integer, p_status text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_plan  public.plans;
  v_start timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status is null or p_status not in ('going', 'cant_go') then raise exception 'invalid_status'; end if;

  -- share-lock: a concurrent cancel/edit (FOR UPDATE) waits, so cancellation wins over a racing answer
  select * into v_plan from public.plans where id = p_plan_id for share;
  if not found or v_plan.state = 'draft'
     or not exists (select 1 from public.rsvps where plan_id = p_plan_id and user_id = v_uid and removed_at is null) then
    raise exception 'plan_not_found';
  end if;
  if v_plan.state = 'cancelled' then raise exception 'plan_cancelled'; end if;
  if p_revision is distinct from v_plan.current_revision then raise exception 'stale_revision'; end if;

  select start_at into v_start from public.plan_revisions
   where plan_id = p_plan_id and revision = v_plan.current_revision;
  if now() >= v_start then raise exception 'answers_locked'; end if;

  if v_uid = v_plan.organizer_id then
    if p_status = 'cant_go' then raise exception 'organizer_cannot_decline'; end if;
    return private.plan_counts(p_plan_id);       -- organizer is always Going
  end if;

  update public.rsvps set status = p_status, revision = p_revision
   where plan_id = p_plan_id and user_id = v_uid;
  return private.plan_counts(p_plan_id);
end $$;

-- ---------------------------------------------------------------- edit_plan
-- p_changes keys (all optional): start_local, end_local ("YYYY-MM-DDTHH:MI:SS" wall-clock), meeting_point, note.
-- Material (new revision): start, end or meeting point changed. Minor (same revision): note only.
-- A material edit flips every Going invitee except the organizer to needs_reconfirm.
-- Returns {material, changed, revision, needs_reconfirm}.
create function public.edit_plan(p_plan_id uuid, p_changes jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_plan  public.plans;
  v_cur   public.plan_revisions;
  v_start timestamptz;
  v_end   timestamptz;
  v_meet  text;
  v_note  text;
  v_material boolean;
  v_rev   int;
  v_n     int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'invalid_changes'; end if;
  if exists (select 1 from jsonb_object_keys(p_changes) k
              where k not in ('start_local', 'end_local', 'meeting_point', 'note')) then
    raise exception 'unknown_field';
  end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found or v_plan.organizer_id <> v_uid then raise exception 'not_organizer'; end if;
  if v_plan.state = 'cancelled' then raise exception 'plan_cancelled'; end if;
  if v_plan.state <> 'sent' then raise exception 'plan_not_sent'; end if;

  select * into v_cur from public.plan_revisions
   where plan_id = p_plan_id and revision = v_plan.current_revision;

  v_start := case when p_changes ? 'start_local'
                  then private.local_to_utc((p_changes ->> 'start_local')::timestamp, v_cur.time_zone)
                  else v_cur.start_at end;
  v_end   := case when p_changes ? 'end_local'
                  then private.local_to_utc((p_changes ->> 'end_local')::timestamp, v_cur.time_zone)
                  else v_cur.end_at end;
  v_meet  := case when p_changes ? 'meeting_point' then btrim(coalesce(p_changes ->> 'meeting_point', ''))
                  else v_cur.meeting_point end;
  v_note  := case when p_changes ? 'note' then nullif(btrim(coalesce(p_changes ->> 'note', '')), '')
                  else v_cur.note end;

  if v_end <= v_start then raise exception 'end_before_start'; end if;
  if char_length(v_meet) not between 1 and 200 then raise exception 'invalid_meeting_point'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'invalid_note'; end if;

  v_material := v_start <> v_cur.start_at or v_end <> v_cur.end_at or v_meet <> v_cur.meeting_point;

  if not v_material then
    if v_note is not distinct from v_cur.note then
      return jsonb_build_object('material', false, 'changed', false, 'revision', v_plan.current_revision,
                                'needs_reconfirm', 0);
    end if;
    update public.plan_revisions set note = v_note
     where plan_id = p_plan_id and revision = v_plan.current_revision;
    return jsonb_build_object('material', false, 'changed', true, 'revision', v_plan.current_revision,
                              'needs_reconfirm', 0);
  end if;

  -- answers lock at the start time, so a plan that has started can no longer be rescheduled
  if now() >= v_cur.start_at then raise exception 'plan_started'; end if;
  if v_start <= now() then raise exception 'start_in_past'; end if;

  v_rev := v_plan.current_revision + 1;
  insert into public.plan_revisions
    (plan_id, revision, start_at, end_at, time_zone, meeting_point, note, price_snapshot, booking_required)
  values (p_plan_id, v_rev, v_start, v_end, v_cur.time_zone, v_meet, v_note, v_cur.price_snapshot, v_cur.booking_required);
  update public.plans set current_revision = v_rev where id = p_plan_id;

  update public.rsvps set status = 'needs_reconfirm'
   where plan_id = p_plan_id and status = 'going' and user_id <> v_plan.organizer_id and removed_at is null;
  get diagnostics v_n = row_count;
  update public.rsvps set revision = v_rev where plan_id = p_plan_id and user_id = v_plan.organizer_id;

  return jsonb_build_object('material', true, 'changed', true, 'revision', v_rev, 'needs_reconfirm', v_n);
end $$;
