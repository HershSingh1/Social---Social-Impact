-- TEC-140 (P2-03 backend, decisions N7 and C5): private feedback on an outing, private preferences, and the
-- shared-only group summary. C5 dropped the budget comfort range, so preferences have no budget field.
begin;

-- The four tags from the spec, in screen order. Adding one means a new migration that replaces this function.
create function private.feedback_tags() returns text[]
language sql immutable set search_path = '' as $$
  select array['Too pricey', 'Too far', 'Great for groups', 'Bad timing']
$$;
revoke all on function private.feedback_tags() from public, anon, authenticated;

-- One row per person per outing. It is the author's alone: no policy lets anyone else read it, and the only
-- thing other members get is the counts in feedback_summary. `shared` says the author lets those counts include it.
create table public.feedback (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating text not null check (rating in ('would_do_again', 'maybe', 'not_for_me')),
  tags text[] not null default '{}' check (tags <@ private.feedback_tags()),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  shared boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index feedback_plan_shared on public.feedback(plan_id) where shared;

-- Everything here is private to the owner. Days and times use fixed words so the app and the server agree;
-- accessibility needs is free text because no frame fixes a list yet.
create table public.preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_days text[] not null default '{}'
    check (preferred_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  preferred_times text[] not null default '{}'
    check (preferred_times <@ array['morning', 'afternoon', 'evening', 'night']),
  accessibility_needs text check (accessibility_needs is null or char_length(accessibility_needs) between 1 and 300),
  updated_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
alter table public.preferences enable row level security;
revoke all on table public.feedback, public.preferences from public, anon, authenticated;
grant select on table public.feedback, public.preferences to authenticated;

create policy own_feedback on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_preferences on public.preferences for select to authenticated
  using (user_id = (select auth.uid()));

-- Only someone who reported they went can rate; everyone else, a stranger or an unknown plan included, gets
-- the same not_attended error. The unique key makes a retry rewrite the same row, so there is no client_key.
-- Tags are checked against the list and stored once each. Never logged.
create function public.set_feedback(plan_id uuid, rating text, tags text[], reason text, shared boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  p public.plans;
  clean_tags text[];
  clean_reason text := nullif(trim(set_feedback.reason), '');
begin
  if rating is null or rating not in ('would_do_again', 'maybe', 'not_for_me') then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if shared is null then raise exception 'invalid_shared' using errcode = 'P0001'; end if;
  if tags is not null and not (tags <@ private.feedback_tags()) then
    raise exception 'invalid_tags' using errcode = 'P0001';
  end if;
  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;
  select * into p from public.plans pl where pl.id = set_feedback.plan_id;
  if not found or p.state = 'draft' or not exists (
    select 1 from public.attendance a
      join public.rsvps r on r.plan_id = a.plan_id and r.user_id = a.user_id and r.removed_at is null
    where a.plan_id = p.id and a.user_id = uid and a.attended = 'yes'
  ) then
    raise exception 'not_attended' using errcode = '42501';
  end if;
  if p.state = 'cancelled' then raise exception 'plan_cancelled' using errcode = 'P0001'; end if;
  select coalesce(array_agg(t order by array_position(private.feedback_tags(), t)), '{}') into clean_tags
    from (select distinct unnest(coalesce(set_feedback.tags, '{}')) t) u;
  insert into public.feedback as f (plan_id, user_id, rating, tags, reason, shared)
    values (p.id, uid, set_feedback.rating, clean_tags, clean_reason, set_feedback.shared)
    on conflict on constraint feedback_pkey do update
      set rating = excluded.rating, tags = excluded.tags, reason = excluded.reason,
          shared = excluded.shared, updated_at = now();
end $$;
revoke all on function public.set_feedback(uuid, text, text[], text, boolean) from public, anon;
grant execute on function public.set_feedback(uuid, text, text[], text, boolean) to authenticated;

-- Removes the caller's own feedback. Deleting nothing is not an error, so a retry is safe.
create function public.delete_feedback(plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  delete from public.feedback f where f.plan_id = delete_feedback.plan_id and f.user_id = uid;
end $$;
revoke all on function public.delete_feedback(uuid) from public, anon;
grant execute on function public.delete_feedback(uuid) to authenticated;

-- Saves the caller's preferences, replacing what was there. Retry-safe: the same call ends in the same row.
--   preferred_days   any of mon tue wed thu fri sat sun
--   preferred_times  any of morning afternoon evening night
--   accessibility_needs  up to 300 characters, blank means none
create function public.set_preferences(preferred_days text[], preferred_times text[], accessibility_needs text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  days text[];
  times text[];
  needs text := nullif(trim(set_preferences.accessibility_needs), '');
begin
  if preferred_days is not null and not (preferred_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) then
    raise exception 'invalid_days' using errcode = 'P0001';
  end if;
  if preferred_times is not null and not (preferred_times <@ array['morning', 'afternoon', 'evening', 'night']) then
    raise exception 'invalid_times' using errcode = 'P0001';
  end if;
  if needs is not null and char_length(needs) > 300 then
    raise exception 'needs_too_long' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(d order by array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], d)), '{}')
    into days from (select distinct unnest(coalesce(set_preferences.preferred_days, '{}')) d) u;
  select coalesce(array_agg(t order by array_position(array['morning', 'afternoon', 'evening', 'night'], t)), '{}')
    into times from (select distinct unnest(coalesce(set_preferences.preferred_times, '{}')) t) u;
  insert into public.preferences as pr (user_id, preferred_days, preferred_times, accessibility_needs)
    values (uid, days, times, needs)
    on conflict (user_id) do update
      set preferred_days = excluded.preferred_days, preferred_times = excluded.preferred_times,
          accessibility_needs = excluded.accessibility_needs, updated_at = now();
end $$;
revoke all on function public.set_preferences(text[], text[], text) from public, anon;
grant execute on function public.set_preferences(text[], text[], text) to authenticated;

-- Removes the caller's preferences. Nothing to remove is not an error.
create function public.clear_preferences() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  delete from public.preferences where user_id = uid;
end $$;
revoke all on function public.clear_preferences() from public, anon;
grant execute on function public.clear_preferences() to authenticated;

-- "N of M who shared" for one outing, for its invitees and for members of its group (N7: group members cannot
-- read the plan, so this is how they see anything). One row, always:
--   shared_count    people who answered Yes to going, are still on the plan, and chose to share
--   would_do_again, maybe, not_for_me   how those shared ratings split; they add up to shared_count
-- Rows with shared = false are never counted, so there is no average over people who kept theirs private.
-- No user id, name, tag or reason is returned. Someone who later changes their attendance to No, or is removed from
-- the plan, drops out of the counts. A missing plan, a draft and a caller with no access get the same error.
create function public.feedback_summary(plan_id uuid) returns table (
  shared_count integer, would_do_again integer, maybe integer, not_for_me integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_profile();
  p public.plans;
begin
  select * into p from public.plans pl where pl.id = feedback_summary.plan_id;
  if not found or p.state = 'draft' or not (
    exists (select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = uid and r.removed_at is null)
    or (p.group_id is not null and private.is_group_member(p.group_id))
  ) then
    raise exception 'no_access' using errcode = '42501';
  end if;
  return query
    select count(*)::integer,
      (count(*) filter (where f.rating = 'would_do_again'))::integer,
      (count(*) filter (where f.rating = 'maybe'))::integer,
      (count(*) filter (where f.rating = 'not_for_me'))::integer
    from public.feedback f
    where f.plan_id = p.id and f.shared
      and exists (select 1 from public.attendance a where a.plan_id = f.plan_id and a.user_id = f.user_id and a.attended = 'yes')
      and exists (select 1 from public.rsvps r where r.plan_id = f.plan_id and r.user_id = f.user_id and r.removed_at is null);
end $$;
revoke all on function public.feedback_summary(uuid) from public, anon;
grant execute on function public.feedback_summary(uuid) to authenticated;

commit;
