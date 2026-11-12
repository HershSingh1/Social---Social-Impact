-- TEC-99 (P0-18 backend): suggest a listing, review it, report outdated info.
begin;

-- Reviewers are named by the team, who add rows here as the database owner (who reviews is still an open
-- team question in the spec). No client can read or write the list.
create table private.reviewers (user_id uuid primary key references public.profiles(id), added_at timestamptz not null default now());
revoke all on table private.reviewers from public, anon, authenticated;
create function private.is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.reviewers r where r.user_id = (select auth.uid()));
$$;
revoke all on function private.is_reviewer() from public, anon;
grant execute on function private.is_reviewer() to authenticated;

create table public.submissions (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id),
  experience_id uuid references public.experiences(id), -- set for edits, and on approval for new listings
  payload jsonb not null, state text not null default 'pending' check (state in ('pending', 'approved', 'needs_changes', 'rejected')),
  reason text, reviewer_id uuid references public.profiles(id), client_key uuid not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index submissions_author on public.submissions(author_id);
create index submissions_queue on public.submissions(created_at) where state = 'pending';
-- One version of a listing waits for review at a time.
create unique index one_open_edit on public.submissions(experience_id) where state in ('pending', 'needs_changes') and experience_id is not null;
create table public.listing_reports (
  experience_id uuid not null references public.experiences(id), version integer not null,
  user_id uuid not null references public.profiles(id), issue text not null check (length(issue) between 1 and 500),
  created_at timestamptz not null default now(), primary key (experience_id, version, user_id)
);
alter table public.submissions enable row level security;
alter table public.listing_reports enable row level security;
revoke all on table public.submissions, public.listing_reports from public, anon, authenticated;
grant select on public.submissions, public.listing_reports to authenticated;
create policy own_or_reviewer on public.submissions for select to authenticated
  using (author_id = (select auth.uid()) or private.is_reviewer());
create policy reviewer_reports on public.listing_reports for select to authenticated using (private.is_reviewer());

-- Remembers each accepted client_key, so a retry returns the same submission and a reused key with a
-- different payload is refused. Written only by submit_listing.
create table private.submit_listing_requests (
  client_key uuid primary key, user_id uuid not null references public.profiles(id),
  submission_id uuid not null references public.submissions(id), payload_hash text not null
);
revoke all on table private.submit_listing_requests from public, anon, authenticated;

-- Field rules from the spec. Returns {field: code} for every field that fails, so the app can show all
-- errors at once under their fields. Empty object means valid.
-- A JSON number as numeric, or null for anything else. Keeps a text value from throwing inside the rules.
create function private.jnum(j jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end;
$$;
revoke all on function private.jnum(jsonb) from public, anon, authenticated;

create function private.listing_errors(pl jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  e jsonb := '{}';
  t text;
  s jsonb;
  n numeric;
  ts_re constant text := '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$';
begin
  t := btrim(coalesce(pl ->> 'name', ''));
  if length(t) = 0 then e := e || '{"name":"required"}'; elsif length(t) > 100 then e := e || '{"name":"too_long"}'; end if;
  t := btrim(coalesce(pl ->> 'description', ''));
  if length(t) < 20 then e := e || '{"description":"too_short"}'; elsif length(t) > 2000 then e := e || '{"description":"too_long"}'; end if;
  if (pl ->> 'category') is null or (pl ->> 'category') not in
      ('Art and walks', 'Make something', 'Outdoors', 'Food and drink', 'Games and trivia', 'Music and film', 'Active') then
    e := e || '{"category":"invalid"}';
  end if;
  -- Location or meeting point: a street address, a meeting point, or a map position.
  if length(btrim(coalesce(pl ->> 'address', ''))) = 0 and length(btrim(coalesce(pl ->> 'meeting_point', ''))) = 0
     and (pl -> 'lat') is null then
    e := e || '{"location":"required"}';
  elsif length(coalesce(pl ->> 'address', '')) > 200 or length(coalesce(pl ->> 'meeting_point', '')) > 200 then
    e := e || '{"location":"too_long"}';
  end if;
  if (pl -> 'lat') is not null or (pl -> 'lng') is not null then
    if jsonb_typeof(pl -> 'lat') is distinct from 'number' or jsonb_typeof(pl -> 'lng') is distinct from 'number'
       or private.jnum(pl -> 'lat') not between -90 and 90 or private.jnum(pl -> 'lng') not between -180 and 180 then
      e := e || '{"location":"invalid"}';
    end if;
  end if;
  if (pl ->> 'timing_kind') = 'fixed' then
    s := pl -> 'sessions';
    if jsonb_typeof(s) is distinct from 'array' or jsonb_array_length(s) not between 1 and 50
       or exists (select 1 from jsonb_array_elements(s) x
                  where jsonb_typeof(x) <> 'object' or (x ->> 'start_local') !~ ts_re or (x ->> 'end_local') !~ ts_re
                     or (x ->> 'end_local') <= (x ->> 'start_local')) then
      e := e || '{"sessions":"invalid"}';
    end if;
  elsif (pl ->> 'timing_kind') = 'flexible' then
    if length(btrim(coalesce(pl ->> 'hours_text', ''))) not between 1 and 200 then e := e || '{"hours_text":"required"}'; end if;
  else
    e := e || '{"timing_kind":"invalid"}';
  end if;
  if jsonb_typeof(pl -> 'duration_min') is distinct from 'number' or private.jnum(pl -> 'duration_min') not between 1 and 1440
     or private.jnum(pl -> 'duration_min') <> trunc(private.jnum(pl -> 'duration_min')) then
    e := e || '{"duration_min":"invalid"}';
  end if;
  case pl ->> 'price_kind'
    when 'exact', 'estimated' then
      if jsonb_typeof(pl -> 'price_min') is distinct from 'number' or private.jnum(pl -> 'price_min') < 0
         or (pl ? 'price_max' and (jsonb_typeof(pl -> 'price_max') is distinct from 'number'
              or private.jnum(pl -> 'price_max') < private.jnum(pl -> 'price_min'))) then
        e := e || '{"price":"invalid"}';
      end if;
    when 'free', 'unknown' then null;
    else e := e || '{"price":"invalid"}';
  end case;
  if coalesce(pl ->> 'source', '') !~ '^https?://\S+$' or length(pl ->> 'source') > 500 then e := e || '{"source":"invalid"}'; end if;
  if (pl -> 'image_url') is not null and (coalesce(pl ->> 'image_url', '') !~ '^https://\S+$' or length(pl ->> 'image_url') > 500) then
    e := e || '{"image_url":"invalid"}';
  end if;
  return e;
end $$;
revoke all on function private.listing_errors(jsonb) from public, anon, authenticated;

-- payload: the form fields (name, description, category, address, meeting_point, lat, lng, timing_kind,
-- sessions or hours_text, duration_min, price_kind, price_min, price_max, source, image_url). Other keys are
-- dropped, never stored. Two control keys: experience_id (edit a listing you wrote and had approved) and
-- submission_id (resubmit one that came back as Needs changes). A bad payload raises invalid_listing with
-- every failing field in the error detail as JSON. Returns the submission id.
create function public.submit_listing(client_key uuid, payload jsonb) returns uuid
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
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if client_key is null then raise exception 'invalid_client_key' using errcode = 'P0001'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'invalid_payload' using errcode = 'P0001'; end if;
  begin
    exp_id := nullif(payload ->> 'experience_id', '')::uuid;
    sub_id := nullif(payload ->> 'submission_id', '')::uuid;
  exception when invalid_text_representation then raise exception 'invalid_payload' using errcode = 'P0001';
  end;
  select coalesce(jsonb_object_agg(k, v), '{}') into clean from jsonb_each(payload) f(k, v)
    where k in ('name', 'description', 'category', 'address', 'meeting_point', 'lat', 'lng', 'timing_kind', 'sessions',
                'hours_text', 'duration_min', 'price_kind', 'price_min', 'price_max', 'source', 'image_url');
  hash := md5(jsonb_build_array(clean, exp_id, sub_id)::text);

  perform pg_advisory_xact_lock(hashtextextended('submit_listing:' || client_key::text, 0));
  select * into req from private.submit_listing_requests r where r.client_key = submit_listing.client_key;
  if found then
    if req.user_id <> uid or req.payload_hash <> hash then raise exception 'client_key_conflict' using errcode = 'P0001'; end if;
    return req.submission_id;
  end if;

  errs := private.listing_errors(clean);
  if errs <> '{}' then raise exception 'invalid_listing' using errcode = 'P0001', detail = errs::text; end if;

  if sub_id is not null then
    select * into sub from public.submissions s where s.id = sub_id and s.author_id = uid for update;
    if not found then raise exception 'submission_not_found' using errcode = 'P0001'; end if;
    if sub.state <> 'needs_changes' then raise exception 'not_resubmittable' using errcode = 'P0001'; end if;
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
    begin
      insert into public.submissions (author_id, experience_id, payload, client_key)
        values (uid, exp_id, clean, client_key) returning * into sub;
    exception when unique_violation then
      raise exception 'edit_in_progress' using errcode = 'P0001';
    end;
  end if;
  insert into private.submit_listing_requests (client_key, user_id, submission_id, payload_hash) values (client_key, uid, sub.id, hash);
  return sub.id;
end $$;
revoke all on function public.submit_listing(uuid, jsonb) from public, anon;
grant execute on function public.submit_listing(uuid, jsonb) to authenticated;

-- decision: approve, needs_changes or reject. Needs changes and reject need a reason (1 to 500 characters).
-- Approving a new listing publishes it; approving an edit updates the live listing and bumps its version, so
-- the old one stays live until then. Deciding twice the same way is a no-op; changing a decision is not_pending.
-- A duplicate is rejected with a reason that points at the existing listing.
create function public.review_submission(id uuid, decision text, reason text default null) returns void
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
          price_min, price_max, timing_kind, sessions, hours_text, duration_min, source, checked_on, status)
        values (btrim(pl ->> 'name'), pl ->> 'category', btrim(pl ->> 'description'), (pl ->> 'lat')::double precision,
          (pl ->> 'lng')::double precision, nullif(btrim(pl ->> 'address'), ''), pl ->> 'image_url', nullif(btrim(pl ->> 'meeting_point'), ''),
          pl ->> 'price_kind',
          case pl ->> 'price_kind' when 'free' then 0 when 'unknown' then null else (pl ->> 'price_min')::numeric end,
          case pl ->> 'price_kind' when 'free' then 0 when 'unknown' then null
            else coalesce((pl ->> 'price_max')::numeric, (pl ->> 'price_min')::numeric) end,
          pl ->> 'timing_kind', case when fixed then pl -> 'sessions' end, case when not fixed then btrim(pl ->> 'hours_text') end,
          (pl ->> 'duration_min')::integer, pl ->> 'source', (now() at time zone 'America/Chicago')::date, 'published')
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

-- Records the issue against the version the person was looking at. A second report from the same person
-- about the same version is ignored.
create function public.report_listing(experience_id uuid, issue text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  ex public.experiences;
  txt text := btrim(coalesce(issue, ''));
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if length(txt) not between 1 and 500 then raise exception 'invalid_issue' using errcode = 'P0001'; end if;
  select * into ex from public.experiences x where x.id = report_listing.experience_id and x.status = 'published';
  if not found then raise exception 'experience_not_found' using errcode = 'P0001'; end if;
  insert into public.listing_reports (experience_id, version, user_id, issue) values (ex.id, ex.version, uid, txt)
    on conflict do nothing;
end $$;
revoke all on function public.report_listing(uuid, text) from public, anon;
grant execute on function public.report_listing(uuid, text) to authenticated;
commit;
