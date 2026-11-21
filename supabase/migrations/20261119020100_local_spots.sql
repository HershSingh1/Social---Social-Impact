-- TEC-141 (P2-11 backend, decision N11 and D8): local spots are suggested listings of a second kind.
-- Same form, same review queue, same reports. An approved local spot is an experience with origin = 'local_spot'
-- and added_by (the author, cleared with the account like submissions.author_id in TEC-119). The author can edit it
-- (a new pending version, as for any listing) or ask for removal; a reviewer removes it. Free, never a paid placement.
begin;

alter table public.submissions add column kind text not null default 'listing' check (kind in ('listing', 'local_spot'));
alter table public.experiences
  add column origin text not null default 'catalog' check (origin in ('catalog', 'local_spot')),
  add column added_by uuid references public.profiles(id) on delete set null,
  add constraint experiences_added_by_local_spot check (added_by is null or origin = 'local_spot');
create index experiences_local_spots on public.experiences(origin) where origin = 'local_spot';

-- submit_listing gains an optional last parameter, so the two-argument calls the app already makes still work.
-- (A new overload would make the same call ambiguous, so the old one is replaced.)
drop function public.submit_listing(uuid, jsonb);
-- kind: 'listing' (default) or 'local_spot'. A local spot with a photo must carry "photo_confirmed": true, the
-- author's confirmation that they may share it; without it the submission fails with photo_confirmed: required.
create function public.submit_listing(client_key uuid, payload jsonb, kind text default 'listing') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  clean jsonb;
  errs jsonb;
  req private.submit_listing_requests;
  hash text;
  sub public.submissions;
  exp_id uuid;
  sub_id uuid;
  want text := coalesce(submit_listing.kind, 'listing');
  want_origin text;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if client_key is null then raise exception 'invalid_client_key' using errcode = 'P0001'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'invalid_payload' using errcode = 'P0001'; end if;
  if want not in ('listing', 'local_spot') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  want_origin := case when want = 'local_spot' then 'local_spot' else 'catalog' end;
  begin
    exp_id := nullif(payload ->> 'experience_id', '')::uuid;
    sub_id := nullif(payload ->> 'submission_id', '')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_payload' using errcode = 'P0001';
  end;
  select coalesce(jsonb_object_agg(k, v), '{}') into clean from jsonb_each(payload) f(k, v)
    where k in ('name', 'description', 'category', 'address', 'meeting_point', 'lat', 'lng', 'timing_kind', 'sessions',
                'hours_text', 'duration_min', 'price_kind', 'price_min', 'price_max', 'source', 'image_url')
       or (k = 'photo_confirmed' and want = 'local_spot');
  -- A listing keeps the hash it always had, so a retry that straddles this migration still matches.
  hash := case when want = 'listing' then md5(jsonb_build_array(clean, exp_id, sub_id)::text)
               else md5(jsonb_build_array(clean, exp_id, sub_id, want)::text) end;

  perform pg_advisory_xact_lock(hashtextextended('submit_listing:' || client_key::text, 0));
  select * into req from private.submit_listing_requests r where r.client_key = submit_listing.client_key;
  if found then
    if req.user_id <> uid or req.payload_hash <> hash then raise exception 'client_key_conflict' using errcode = 'P0001'; end if;
    return req.submission_id;
  end if;

  errs := private.listing_errors(clean);
  -- A local spot with a photo needs the author's confirmation that they may share it (P2-11).
  if want = 'local_spot' and (clean -> 'image_url') is not null and (clean -> 'photo_confirmed') is distinct from 'true'::jsonb then
    errs := errs || '{"photo_confirmed":"required"}';
  end if;
  if errs <> '{}' then raise exception 'invalid_listing' using errcode = 'P0001', detail = errs::text; end if;

  if sub_id is not null then
    select * into sub from public.submissions s where s.id = sub_id and s.author_id = uid for update;
    if not found then raise exception 'submission_not_found' using errcode = 'P0001'; end if;
    if sub.state <> 'needs_changes' then raise exception 'not_resubmittable' using errcode = 'P0001'; end if;
    if sub.kind <> want then raise exception 'kind_mismatch' using errcode = 'P0001'; end if;
    update public.submissions s set payload = clean, state = 'pending', reason = null, reviewer_id = null, updated_at = now()
      where s.id = sub.id;
  else
    if (select count(*) from public.submissions s where s.author_id = uid and s.state in ('pending', 'needs_changes')) >= 10 then
      raise exception 'too_many_open' using errcode = 'P0001';
    end if;
    if exp_id is not null and not exists (
      select 1 from public.submissions s join public.experiences x on x.id = s.experience_id
        where s.author_id = uid and s.state = 'approved' and s.experience_id = exp_id and x.status = 'published') then
      raise exception 'not_your_listing' using errcode = '42501';
    end if;
    -- An edit stays the kind of thing it is: a local spot is edited as a local spot, a catalog listing as a listing.
    if exp_id is not null and (select x.origin from public.experiences x where x.id = exp_id) is distinct from want_origin then
      raise exception 'kind_mismatch' using errcode = 'P0001';
    end if;
    begin
      insert into public.submissions (author_id, experience_id, payload, client_key, kind)
        values (uid, exp_id, clean, client_key, want) returning * into sub;
    exception when unique_violation then
      raise exception 'edit_in_progress' using errcode = 'P0001';
    end;
  end if;
  insert into private.submit_listing_requests (client_key, user_id, submission_id, payload_hash) values (client_key, uid, sub.id, hash);
  return sub.id;
end $$;
revoke all on function public.submit_listing(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_listing(uuid, jsonb, text) to authenticated;

-- Approving a local spot gives the experience its origin and author.
create or replace function public.review_submission(id uuid, decision text, reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  sub public.submissions;
  why text := nullif(btrim(coalesce(reason, '')), '');
  pl jsonb;
  new_state text;
  exp_id uuid;
  fixed boolean;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if not private.is_reviewer() then raise exception 'not_reviewer' using errcode = '42501'; end if;
  new_state := case decision when 'approve' then 'approved' when 'needs_changes' then 'needs_changes' when 'reject' then 'rejected' end;
  if new_state is null then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  if new_state <> 'approved' and why is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if length(why) > 500 then raise exception 'reason_too_long' using errcode = 'P0001'; end if;
  select * into sub from public.submissions s where s.id = review_submission.id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0001'; end if;
  if sub.state <> 'pending' then
    if sub.state = new_state and sub.reviewer_id = uid then return; end if;
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  if new_state = 'approved' then
    pl := sub.payload;
    fixed := pl ->> 'timing_kind' = 'fixed';
    if sub.experience_id is null then
      insert into public.experiences (name, category, description, lat, lng, address, image_url, meeting_point, price_kind,
          price_min, price_max, timing_kind, sessions, hours_text, duration_min, source, checked_on, status, origin, added_by)
        values (btrim(pl ->> 'name'), pl ->> 'category', btrim(pl ->> 'description'), (pl ->> 'lat')::double precision,
          (pl ->> 'lng')::double precision, nullif(btrim(pl ->> 'address'), ''), pl ->> 'image_url', nullif(btrim(pl ->> 'meeting_point'), ''),
          pl ->> 'price_kind',
          case pl ->> 'price_kind' when 'free' then 0 when 'unknown' then null else (pl ->> 'price_min')::numeric end,
          case pl ->> 'price_kind' when 'free' then 0 when 'unknown' then null
            else coalesce((pl ->> 'price_max')::numeric, (pl ->> 'price_min')::numeric) end,
          pl ->> 'timing_kind', case when fixed then pl -> 'sessions' end, case when not fixed then btrim(pl ->> 'hours_text') end,
          (pl ->> 'duration_min')::integer, pl ->> 'source', (now() at time zone 'America/Chicago')::date, 'published',
          case sub.kind when 'local_spot' then 'local_spot' else 'catalog' end,
          case sub.kind when 'local_spot' then sub.author_id end)
        returning experiences.id into exp_id;
    else
      exp_id := sub.experience_id;
      update public.experiences x set name = btrim(pl ->> 'name'), category = pl ->> 'category',
          description = btrim(pl ->> 'description'), lat = (pl ->> 'lat')::double precision, lng = (pl ->> 'lng')::double precision,
          address = nullif(btrim(pl ->> 'address'), ''), image_url = pl ->> 'image_url', meeting_point = nullif(btrim(pl ->> 'meeting_point'), ''),
          price_kind = pl ->> 'price_kind',
          price_min = case pl ->> 'price_kind' when 'free' then 0 when 'unknown' then null else (pl ->> 'price_min')::numeric end,
          price_max = case pl ->> 'price_kind' when 'free' then 0 when 'unknown' then null
            else coalesce((pl ->> 'price_max')::numeric, (pl ->> 'price_min')::numeric) end,
          timing_kind = pl ->> 'timing_kind', sessions = case when fixed then pl -> 'sessions' end,
          hours_text = case when not fixed then btrim(pl ->> 'hours_text') end, duration_min = (pl ->> 'duration_min')::integer,
          source = pl ->> 'source', checked_on = (now() at time zone 'America/Chicago')::date, version = x.version + 1
        where x.id = exp_id;
    end if;
    update public.submissions s set state = 'approved', experience_id = exp_id, reviewer_id = uid, reason = why, updated_at = now() where s.id = sub.id;
  else
    update public.submissions s set state = new_state, reviewer_id = uid, reason = why, updated_at = now() where s.id = sub.id;
  end if;
end $$;
revoke all on function public.review_submission(uuid, text, text) from public, anon;
grant execute on function public.review_submission(uuid, text, text) to authenticated;

-- The author's name for the "Local spot, added by {name}" label. Anyone who can see a published local spot sees
-- its author's card; nobody else gains visibility, and a removed spot ends it. Same signature and columns.
create or replace function public.get_profile_cards(user_ids uuid[])
returns table (user_id uuid, display_name text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_path
  from public.profiles p
  where p.id = any (coalesce(user_ids, '{}'::uuid[]))
    and (select auth.uid()) is not null
    and (
      p.id = (select auth.uid())
      -- Shares an active (not removed, not blocked) group with the caller.
      or exists (
        select 1 from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
        where mine.user_id = (select auth.uid()) and mine.removed_at is null and not mine.blocked
          and theirs.user_id = p.id and theirs.removed_at is null and not theirs.blocked)
      -- Or the caller owns a group this person is blocked from (the owner's Removed list).
      or exists (
        select 1 from public.groups g
        join public.group_members mine on mine.group_id = g.id
        join public.group_members theirs on theirs.group_id = g.id
        where g.owner_id = (select auth.uid())
          and mine.user_id = g.owner_id and mine.removed_at is null and not mine.blocked
          and theirs.user_id = p.id and theirs.blocked)
      -- Or added a local spot that is on the map: its "Added by {name}" label is for everyone who can see the spot (P2-11).
      or exists (
        select 1 from public.experiences x
        where x.added_by = p.id and x.origin = 'local_spot' and x.status = 'published')
      -- Or is on a sent plan the caller can read (organizer or active invitee).
      or exists (
        select 1 from public.plans pl
        where pl.state <> 'draft' and private.can_read_plan(pl.id)
          and (pl.organizer_id = p.id or exists (
            select 1 from public.rsvps r
            where r.plan_id = pl.id and r.user_id = p.id and r.removed_at is null)))
    );
$$;

-- Asking for removal: the author says so, a reviewer decides. One open request per spot; the requester is cleared
-- with their account, the request stays for the reviewer.
create table public.local_spot_removal_requests (
  experience_id uuid primary key references public.experiences(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.local_spot_removal_requests enable row level security;
revoke all on table public.local_spot_removal_requests from public, anon, authenticated;
grant select on table public.local_spot_removal_requests to authenticated;
create policy own_or_reviewer on public.local_spot_removal_requests for select to authenticated
  using (requested_by = (select auth.uid()) or private.is_reviewer());

-- Only the person who added the spot, and only while it is on the map. Asking again changes nothing.
create function public.request_local_spot_removal(experience_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if not exists (select 1 from public.experiences x where x.id = request_local_spot_removal.experience_id
      and x.origin = 'local_spot' and x.status = 'published' and x.added_by = uid) then
    raise exception 'not_your_listing' using errcode = '42501';
  end if;
  insert into public.local_spot_removal_requests (experience_id, requested_by)
    values (request_local_spot_removal.experience_id, uid) on conflict do nothing;
end $$;
revoke all on function public.request_local_spot_removal(uuid) from public, anon;
grant execute on function public.request_local_spot_removal(uuid) to authenticated;

-- A reviewer takes a local spot off the map (whether or not its author asked). The row stays, with status 'removed',
-- so plans and picks that already point at it keep their history; every reader of the catalog only lists 'published'.
-- An edit still waiting for review is closed with the reason. Removing twice changes nothing.
create function public.remove_local_spot(experience_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ex public.experiences;
begin
  perform public.require_profile();
  if not private.is_reviewer() then raise exception 'not_reviewer' using errcode = '42501'; end if;
  select * into ex from public.experiences x where x.id = remove_local_spot.experience_id for update;
  if not found or ex.origin <> 'local_spot' then raise exception 'not_local_spot' using errcode = 'P0001'; end if;
  if ex.status = 'removed' then return; end if;
  update public.experiences x set status = 'removed' where x.id = ex.id;
  update public.submissions s set state = 'rejected', reason = 'This spot was removed.', reviewer_id = (select auth.uid()), updated_at = now()
    where s.experience_id = ex.id and s.state in ('pending', 'needs_changes');
  delete from public.local_spot_removal_requests r where r.experience_id = ex.id;
end $$;
revoke all on function public.remove_local_spot(uuid) from public, anon;
grant execute on function public.remove_local_spot(uuid) to authenticated;

commit;
