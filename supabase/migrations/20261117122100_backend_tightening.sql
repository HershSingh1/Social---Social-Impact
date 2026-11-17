-- TEC-122: three P0 rules that drifted from the spec. Function signatures are unchanged.
begin;

-- edit_plan: same limits as send_plan (meeting point 1 to 200 characters, note up to 500).
create or replace function public.edit_plan(plan_id uuid, changes jsonb)
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
    if length(new_point) > 200 then raise exception 'invalid_meeting_point' using errcode = 'P0001'; end if;
  end if;
  if changes ? 'note' then
    if jsonb_typeof(changes -> 'note') not in ('string', 'null') then
      raise exception 'invalid_changes' using errcode = 'P0001';
    end if;
    new_note := changes ->> 'note';
    if length(new_note) > 500 then raise exception 'invalid_note' using errcode = 'P0001'; end if;
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

-- Someone who leaves or is removed no longer counts toward "N of M voted" on the group's open picks.
-- Closed picks keep their rows as a record. Rejoining mid-pick gets a fresh row on the next vote (cast_vote).
create function private.clear_pick_voter_status_on_membership_end() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.pick_voter_status s using public.picks p
      where p.id = s.pick_id and p.group_id = old.group_id and p.state = 'open' and s.user_id = old.user_id;
    return old;
  end if;
  if old.removed_at is null and not old.blocked
      and (new.removed_at is not null or new.blocked) then
    delete from public.pick_voter_status s using public.picks p
      where p.id = s.pick_id and p.group_id = new.group_id and p.state = 'open' and s.user_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function private.clear_pick_voter_status_on_membership_end() from public, anon, authenticated;

create trigger clear_pick_voter_status_when_membership_ends
  after update of removed_at, blocked or delete on public.group_members
  for each row execute function private.clear_pick_voter_status_on_membership_end();

-- join_group: archived groups don't count toward the 20-group limit, matching create_group.
create or replace function public.join_group(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  r record;
  m public.group_members;
begin
  select * into r from private.check_join_code(uid, code);
  if r.err is not null then return jsonb_build_object('ok', false, 'error', r.err); end if;

  -- Serialize joins per group so the 30-member cap cannot be raced past.
  perform 1 from public.groups where id = r.gid for update;
  select * into m from public.group_members where group_id = r.gid and user_id = uid;
  if found and m.removed_at is null and not m.blocked then
    return jsonb_build_object('ok', true, 'group_id', r.gid, 'already_member', true);
  end if;
  if found and m.blocked then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  if (select count(*) from public.group_members where group_id = r.gid and removed_at is null and not blocked) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'group_full');
  end if;
  if (select count(*) from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.user_id = uid and gm.removed_at is null and not gm.blocked and g.archived_at is null) >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many_groups');
  end if;
  -- A row with removed_at set and not blocked is someone who left; they may rejoin.
  insert into public.group_members (group_id, user_id) values (r.gid, uid)
    on conflict (group_id, user_id) do update set removed_at = null, joined_at = now();
  return jsonb_build_object('ok', true, 'group_id', r.gid, 'already_member', false);
end $$;

commit;
