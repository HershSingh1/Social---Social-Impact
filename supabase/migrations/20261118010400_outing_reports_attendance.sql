-- TEC-132 (P2-01 backend, decision N7): did the outing happen, did each person go, and group history.
begin;

-- The organizer's answer for a plan: one row, changed in place. Silence is no row, never a status.
create table public.outing_reports (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  organizer_status text not null check (organizer_status in ('happened', 'didnt_happen', 'not_sure')),
  reported_at timestamptz not null default now()
);

-- A person's answer about themselves. Only Going invitees can write one; there is no row for "Skip" or silence.
create table public.attendance (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attended text not null check (attended in ('yes', 'no')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index attendance_user on public.attendance(user_id, plan_id);

-- Definer helper (same reason as can_read_plan): the policy must not depend on the caller's own read access.
create function private.is_plan_organizer(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plans p where p.id = target and p.organizer_id = (select auth.uid()));
$$;
revoke all on function private.is_plan_organizer(uuid) from public, anon;
grant execute on function private.is_plan_organizer(uuid) to authenticated;

alter table public.outing_reports enable row level security;
alter table public.attendance enable row level security;
revoke all on table public.outing_reports, public.attendance from public, anon, authenticated;
grant select on table public.outing_reports, public.attendance to authenticated;

-- Reports are the organizer's. Attendance is the owner's only: nobody else reads it, the organizer included.
-- Group members get totals through group_history, never from these tables.
create policy organizer_report on public.outing_reports for select to authenticated
  using (private.is_plan_organizer(plan_id));
create policy own_attendance on public.attendance for select to authenticated
  using (user_id = (select auth.uid()));

-- The organizer says whether the outing happened. Allowed once the current revision's end time is 2 hours past;
-- can be changed later. Same error for a missing plan, a draft and a plan the caller does not organize.
-- No client_key: the plan id is the natural key, so a retry rewrites the same row.
create function public.report_outing(plan_id uuid, status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  ends timestamptz;
begin
  perform public.require_profile();
  if status is null or status not in ('happened', 'didnt_happen', 'not_sure') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select * into p from public.plans pl where pl.id = report_outing.plan_id;
  if not found or p.state = 'draft' or p.organizer_id is distinct from (select auth.uid()) then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select v.end_at into ends from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if now() < ends + interval '2 hours' then raise exception 'too_early' using errcode = 'P0001'; end if;
  insert into public.outing_reports as o (plan_id, organizer_status)
    values (p.id, report_outing.status)
    on conflict on constraint outing_reports_pkey do update set organizer_status = excluded.organizer_status, reported_at = now();
end $$;
revoke all on function public.report_outing(uuid, text) from public, anon;
grant execute on function public.report_outing(uuid, text) to authenticated;

-- An invitee whose RSVP is Going says whether they went, yes or no. Same 2 hour rule; can be changed later.
-- Anyone else (not invited, awaiting, can't go, removed, draft) gets the same not_going error.
create function public.report_attendance(plan_id uuid, attended text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  p public.plans;
  ends timestamptz;
begin
  if attended is null or attended not in ('yes', 'no') then
    raise exception 'invalid_attended' using errcode = 'P0001';
  end if;
  select * into p from public.plans pl where pl.id = report_attendance.plan_id;
  if not found or p.state = 'draft' or not exists (
    select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = uid
      and r.status = 'going' and r.removed_at is null
  ) then
    raise exception 'not_going' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select v.end_at into ends from public.plan_revisions v where v.plan_id = p.id and v.revision = p.current_revision;
  if now() < ends + interval '2 hours' then raise exception 'too_early' using errcode = 'P0001'; end if;
  insert into public.attendance as a (plan_id, user_id, attended)
    values (p.id, uid, report_attendance.attended)
    on conflict on constraint attendance_pkey do update set attended = excluded.attended, updated_at = now();
end $$;
revoke all on function public.report_attendance(uuid, text) from public, anon;
grant execute on function public.report_attendance(uuid, text) to authenticated;

-- Past outings for a group, newest first, for any active member (N7: members cannot read plans they were not
-- invited to). A plan is past once its current revision has ended; drafts are never listed. Cancelled plans
-- stay in the list (cancelled = true) but never count as outings.
--   organizer_status  what the organizer said (happened, didnt_happen, not_sure), null while they have not said
--   you_went          the caller's own answer: true, false, or null when they have not answered
--   going_count       people whose RSVP is Going; a Going RSVP is not attendance
--   attended_count    people who answered Yes; 0 until someone reports
--   counts_as_outing  true only when the organizer says it happened and the plan is not cancelled, so the group's
--                     outing count is the number of rows where this is true. Changing to didnt_happen drops it.
-- Returns no user id or name, and no notes. Counts are the only thing said about other people.
create function public.group_history(group_id uuid) returns table (
  plan_id uuid, activity_name text, start_at timestamptz, end_at timestamptz, time_zone text,
  cancelled boolean, organizer_status text, you_went boolean,
  going_count integer, attended_count integer, counts_as_outing boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_profile();
  if not private.is_group_member(group_history.group_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  return query
    select p.id, p.experience_name, v.start_at, v.end_at, v.time_zone,
      p.state = 'cancelled', o.organizer_status,
      (select a.attended = 'yes' from public.attendance a where a.plan_id = p.id and a.user_id = (select auth.uid())),
      (select count(*)::integer from public.rsvps r
        where r.plan_id = p.id and r.status = 'going' and r.removed_at is null),
      (select count(*)::integer from public.attendance a
        where a.plan_id = p.id and a.attended = 'yes'
          and exists (select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = a.user_id and r.removed_at is null)),
      p.state <> 'cancelled' and coalesce(o.organizer_status = 'happened', false)
    from public.plans p
    join public.plan_revisions v on v.plan_id = p.id and v.revision = p.current_revision
    left join public.outing_reports o on o.plan_id = p.id
    where p.group_id = group_history.group_id and p.state in ('sent', 'cancelled') and v.end_at <= now()
    order by v.end_at desc, p.id;
end $$;
revoke all on function public.group_history(uuid) from public, anon;
grant execute on function public.group_history(uuid) to authenticated;

commit;
