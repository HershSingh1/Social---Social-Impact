begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---- test helpers (pg_temp: vanish with the session). Call them as the superuser: `reset role;` first.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$ select md5('sq-test-' || p)::uuid $$;
do $$ begin execute format('grant usage on schema %s to public', pg_my_temp_schema()::regnamespace); end $$;
create function pg_temp.mk(p text, p_anon boolean default false) returns void language plpgsql as $$
begin
  insert into auth.users (id, aud, role, email, is_anonymous)
  values (pg_temp.uid(p), 'authenticated', 'authenticated',
          case when p_anon then null else lower(p) || '@example.test' end, p_anon);
  insert into public.profiles (id, display_name, is_guest) values (pg_temp.uid(p), initcap(p), p_anon);
end $$;
create function pg_temp.login(p text) returns void language plpgsql as $$
declare v_anon boolean;
begin
  execute 'reset role';
  select is_anonymous into v_anon from auth.users where id = pg_temp.uid(p);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated',
                     'is_anonymous', v_anon)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.gid(p text default 'Saturday crew') returns uuid language sql stable security definer as
  $$ select id from public.groups where name = p $$;
create function pg_temp.code(p text default 'Saturday crew') returns text language sql stable security definer as
  $$ select code from public.join_codes where group_id = pg_temp.gid(p) and revoked_at is null $$;
create function pg_temp.eid(p text) returns uuid language sql stable security definer as
  $$ select id from public.experiences where name = p $$;
create function pg_temp.world() returns void language plpgsql as $$
begin
  perform pg_temp.mk('maya'); perform pg_temp.mk('jordan', true); perform pg_temp.mk('sam', true);
  perform pg_temp.mk('priya'); perform pg_temp.mk('luis'); perform pg_temp.mk('tess');
  insert into public.experiences (name, category, description, lat, lng, area, price_kind, price_min, price_max,
    timing_kind, sessions, hours_text, duration_min, meeting_point, booking_required, booking_url, source, checked_on)
  values
   ('Sketch and stroll', 'art_walks', 'Walk and draw.', 30.27, -97.75, 'Shoal Creek', 'free', 0, 0,
    'flexible', null, 'Trail open daily', 90, 'Benches at the W 3rd St trailhead', false, null, 'PLACEHOLDER: test', '2026-11-02'),
   ('Clay and conversation', 'make', 'Wheel throwing.', 30.26, -97.72, 'East Austin', 'exact', 38, 38,
    'fixed', '["Sat 10:00 AM"]'::jsonb, null, 90, 'Studio front desk', true, 'https://example.com/clay', 'PLACEHOLDER: test', '2026-11-02'),
   ('Barton Springs swim', 'outdoors', 'Cold pool.', 30.264, -97.771, 'Zilker', 'estimated', 5, 9,
    'flexible', null, 'Open most days', 90, 'Main gate', false, null, 'PLACEHOLDER: test', '2026-11-02'),
   ('Mount Bonnell sunset', 'outdoors', 'Stairs.', 30.32, -97.77, 'West Austin', 'free', 0, 0,
    'flexible', null, 'Park open', 45, 'Base of the stairs', false, null, 'PLACEHOLDER: test', '2026-11-02');
end $$;
-- Saturday crew: Maya (owner, account) + Jordan, Sam (guests) + Priya, Luis, Tess (accounts)
create function pg_temp.crew() returns void language plpgsql as $$
declare m text;
begin
  perform pg_temp.world();
  perform pg_temp.login('maya'); perform public.create_group('Saturday crew');
  execute 'reset role';
  foreach m in array array['jordan', 'sam', 'priya', 'luis', 'tess'] loop
    perform pg_temp.login(m); perform public.join_group(pg_temp.code());
    execute 'reset role';
  end loop;
end $$;

-- =====================================================================================================
-- P0-10 to P0-14: send, idempotency, RSVP counts, material edits, stale revisions, access
-- =====================================================================================================
-- wall-clock America/Chicago time N days from today at H:00 (afternoon hours avoid DST edges)
create function pg_temp.lt(p_days int, p_hour int) returns timestamp language sql stable as
  $$ select date_trunc('day', now() at time zone 'America/Chicago') + p_days * interval '1 day' + p_hour * interval '1 hour' $$;
create function pg_temp.key(p int) returns uuid language sql immutable as $$ select md5('sq-key-' || p)::uuid $$;
-- "going/awaiting/cant_go/needs_reconfirm" for a plan (superuser view)
create function pg_temp.counts(p_plan uuid) returns text language sql stable security definer as $$
  select count(*) filter (where status = 'going') || '/' || count(*) filter (where status = 'awaiting') || '/'
      || count(*) filter (where status = 'cant_go') || '/' || count(*) filter (where status = 'needs_reconfirm')
    from public.rsvps where plan_id = p_plan and removed_at is null $$;
create function pg_temp.opt(p_pick uuid, p_name text) returns uuid language sql stable security definer as
  $$ select o.id from public.pick_options o join public.experiences e on e.id = o.experience_id
      where o.pick_id = p_pick and e.name = p_name order by o.position limit 1 $$;

create function pg_temp.opts2(variadic p text[]) returns jsonb language sql stable as
  $$ select jsonb_agg(jsonb_build_object('experience_id', pg_temp.eid(x)) order by ord) from unnest(p) with ordinality t(x, ord) $$;
create function pg_temp.vote(u text, p_pick uuid, p_name text, v text) returns void language plpgsql as $$
begin
  perform pg_temp.login(u);
  perform public.cast_vote(pg_temp.opt(p_pick, p_name), v);
  execute 'reset role';
end $$;

select pg_temp.crew();
select pg_temp.mk('outsider');
select pg_temp.mk('late');

-- ---- who can send, and validation
select pg_temp.login('jordan');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'account_required', 'a guest cannot send a plan');
select pg_temp.login('outsider');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'not_member', 'a non-member cannot send a plan for the group');
select pg_temp.login('maya');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Studio')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Clay and conversation'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'fixed_sessions_not_supported', 'fixed-session experiences wait for the pilot');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(-1, 14), pg_temp.lt(-1, 16)),
                 'P0001', 'start_in_past', 'a start in the past is refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 16), pg_temp.lt(3, 14)),
                 'P0001', 'end_before_start', 'an end before the start is refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 14)),
                 'P0001', 'end_before_start', 'an end equal to the start is refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, '2027-03-14 02:30', '2027-03-14 04:00', 'Trailhead')$$, pg_temp.key(1),
                 pg_temp.gid(), pg_temp.eid('Sketch and stroll')),
                 'P0001', 'nonexistent_local_time', '2:30 AM on the spring-forward day does not exist and is rejected, not shifted');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead', null, null, null, 'Mars/Olympus')$$, pg_temp.key(1),
                 pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'invalid_time_zone', 'unknown time zone refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, '   ')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'invalid_meeting_point', 'blank meeting point refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, repeat('m', 201))$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'invalid_meeting_point', 'meeting point over 200 characters refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead', repeat('n', 501))$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'invalid_note', 'note over 500 characters refused');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'Trailhead', null, %L)$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16), array[pg_temp.uid('outsider')]),
                 'P0001', 'recipient_not_member', 'cannot invite someone who is not in the group');
select throws_ok(format($$select public.send_plan(null, %L, %L, %L, %L, 'Trailhead')$$, pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'client_key_required', 'a request key is required');
reset role;
select is((select count(*)::int from public.plans), 0, 'nothing was created by any rejected send');

-- ---- send: one plan, revision 1, organizer Going, everyone else Awaiting
select pg_temp.login('maya');
select set_config('t.plan', public.send_plan(pg_temp.key(1), pg_temp.gid(), pg_temp.eid('Sketch and stroll'),
                   pg_temp.lt(3, 14), pg_temp.lt(3, 16), '  Benches at the W 3rd St trailhead  ', 'Bring a sketchbook')::text, true);
reset role;
select is((select state || '/' || current_revision from public.plans where id = current_setting('t.plan')::uuid), 'sent/1', 'plan is sent at revision 1');
select is(pg_temp.counts(current_setting('t.plan')::uuid), '1/5/0/0', 'sent: 1 Going (organizer), 5 Awaiting');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('maya')), 'going', 'organizer is Going');
select is((select meeting_point from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 1),
          'Benches at the W 3rd St trailhead', 'meeting point stored trimmed');
select is((select start_at from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 1),
          (pg_temp.lt(3, 14) at time zone 'America/Chicago'), 'start stored as the UTC instant of the Chicago wall-clock time');
select is((select time_zone from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 1), 'America/Chicago', 'time zone stored');
select is((select price_snapshot ->> 'price_kind' from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 1),
          'free', 'price snapshot taken at send');

-- ---- idempotency (T04): the same key returns the same plan
select pg_temp.login('maya');
select is(public.send_plan(pg_temp.key(1), pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16),
                           'Benches at the W 3rd St trailhead', 'Bring a sketchbook')::text,
          current_setting('t.plan'), 'retrying with the same key returns the existing plan');
reset role;
select is((select count(*)::int from public.plans where client_key = pg_temp.key(1)), 1, 'exactly one plan for the key');
select is((select count(*)::int from public.rsvps where plan_id = current_setting('t.plan')::uuid), 6, 'exactly one invitation per person');
select pg_temp.login('priya');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'x')$$, pg_temp.key(1), pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)),
                 'P0001', 'client_key_conflict', 'another user cannot reuse a key');
reset role;

-- ---- access: invitees read the plan; a member who joins later does not
select pg_temp.login('jordan');
select is((select count(*)::int from public.plans), 1, 'a guest invitee reads the plan');
select is((select count(*)::int from public.rsvps), 6, 'invitees read all RSVPs');
select is((select count(*)::int from public.plan_revisions), 1, 'invitees read the revisions');
reset role; select pg_temp.login('late'); select public.join_group(pg_temp.code());
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid()), 7, 'the late joiner sees the group roster');
select is((select count(*)::int from public.plans), 0, 'joining the group after the plan was sent does not reveal the plan');
select is((select count(*)::int from public.rsvps) + (select count(*)::int from public.plan_revisions), 0, 'nor its RSVPs or revisions');
select throws_ok(format($$select public.respond(%L, 1, 'going')$$, current_setting('t.plan')), 'P0001', 'plan_not_found',
                 'and they cannot answer it');
reset role;

-- a member who is not on the recipient list cannot see the plan either
select pg_temp.login('maya');
select set_config('t.plan_b', public.send_plan(pg_temp.key(2), pg_temp.gid(), pg_temp.eid('Barton Springs swim'),
                   pg_temp.lt(4, 14), pg_temp.lt(4, 16), 'Main gate', null, array[pg_temp.uid('jordan')])::text, true);
select pg_temp.login('tess');
select is((select count(*)::int from public.plans where id = current_setting('t.plan_b')::uuid), 0, 'a member not invited cannot read the plan');
reset role;
select is(pg_temp.counts(current_setting('t.plan_b')::uuid), '1/1/0/0', 'a plan can go to a subset: organizer + 1 invitee');
select pg_temp.login('maya');
select set_config('t.plan_c', public.send_plan(pg_temp.key(3), pg_temp.gid(), pg_temp.eid('Mount Bonnell sunset'),
                   pg_temp.lt(5, 14), pg_temp.lt(5, 16), 'Base of the stairs', null, '{}')::text, true);
reset role;
select is(pg_temp.counts(current_setting('t.plan_c')::uuid), '1/0/0/0', 'the organizer alone is allowed');

-- ---- RSVP count sequence from P0-13 / P0-14:  1/5/0/0 -> 3/3/0/0 -> 3/2/1/0 -> 1/2/1/2 -> 2/2/1/1 -> 2/2/2/0
select pg_temp.login('jordan');
select is((select public.respond(current_setting('t.plan')::uuid, 1, 'going') ->> 'going'), '2', 'jordan Going (guest can RSVP)');
select pg_temp.login('sam');
select is((select public.respond(current_setting('t.plan')::uuid, 1, 'going') ->> 'going'), '3', 'sam Going');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '3/3/0/0', 'after two Going answers: 3/3/0/0');
select pg_temp.login('priya');
select public.respond(current_setting('t.plan')::uuid, 1, 'cant_go');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '3/2/1/0', 'after one Can''t go: 3/2/1/0');

-- guests can change their answer until the start
select pg_temp.login('jordan');
select public.respond(current_setting('t.plan')::uuid, 1, 'cant_go');
select public.respond(current_setting('t.plan')::uuid, 1, 'going');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '3/2/1/0', 'changing an answer and back leaves the counts');

-- material edit: time moves 1 hour later
select pg_temp.login('jordan');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('note', 'hi')),
                 'P0001', 'not_organizer', 'an invitee cannot edit the plan');
select pg_temp.login('maya');
select is((select public.edit_plan(current_setting('t.plan')::uuid, jsonb_build_object(
             'start_local', to_char(pg_temp.lt(3, 15), 'YYYY-MM-DD"T"HH24:MI:SS'),
             'end_local', to_char(pg_temp.lt(3, 17), 'YYYY-MM-DD"T"HH24:MI:SS'))) ->> 'needs_reconfirm'),
          '2', 'edit reports 2 Going invitees will need to reconfirm');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '1/2/1/2', 'after the time change: 1/2/1/2 (only the organizer stays Going)');
select is((select current_revision from public.plans where id = current_setting('t.plan')::uuid), 2, 'revision is now 2');
select is((select count(*)::int from public.plan_revisions where plan_id = current_setting('t.plan')::uuid), 2, 'old revision kept for the old-vs-new banner');
select is((select start_at from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 2) -
          (select start_at from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 1), interval '1 hour', 'new start is one hour later');
select is((select note from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 2), 'Bring a sketchbook', 'unchanged fields carry over');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('priya')), 'cant_go', 'Can''t go is untouched by the edit');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('luis')), 'awaiting', 'Awaiting is untouched by the edit');

-- stale answer is rejected
select pg_temp.login('jordan');
select throws_ok(format($$select public.respond(%L, 1, 'going')$$, current_setting('t.plan')), 'P0001', 'stale_revision',
                 'an answer given against revision 1 is rejected after the edit');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('jordan')),
          'needs_reconfirm', 'a rejected stale answer changes nothing');
select public.respond(current_setting('t.plan')::uuid, 2, 'going');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '2/2/1/1', 'jordan reconfirms: 2/2/1/1');
select pg_temp.login('sam');
select public.respond(current_setting('t.plan')::uuid, 2, 'cant_go');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '2/2/2/0', 'sam declines the new time: 2/2/2/0');
select is((select revision from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('jordan')), 2,
          'the answer records the revision it was given against');

-- counts always add up to the number of invitees
select is((select count(*)::int from public.rsvps where plan_id = current_setting('t.plan')::uuid and removed_at is null), 6, 'counts add up to 6 invitees');

-- ---- respond rules
select pg_temp.login('maya');
select throws_ok(format($$select public.respond(%L, 2, 'cant_go')$$, current_setting('t.plan')), 'P0001', 'organizer_cannot_decline', 'the organizer cannot decline their own plan');
select is((select public.respond(current_setting('t.plan')::uuid, 2, 'going') ->> 'going'), '2', 'the organizer answering Going changes nothing');
select throws_ok(format($$select public.respond(%L, 2, 'maybe')$$, current_setting('t.plan')), 'P0001', 'invalid_status', 'no Maybe on a plan');
select throws_ok(format($$select public.respond(%L, 2, 'awaiting')$$, current_setting('t.plan')), 'P0001', 'invalid_status', 'Awaiting cannot be chosen');
reset role;

-- ---- minor edits keep the revision and everyone's answer
select pg_temp.login('maya');
select is((select public.edit_plan(current_setting('t.plan')::uuid, jsonb_build_object('note', 'Bring pencils too')) ->> 'material'), 'false', 'a note change is minor');
reset role;
select is((select current_revision from public.plans where id = current_setting('t.plan')::uuid), 2, 'minor edit keeps the revision');
select is((select note from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 2), 'Bring pencils too', 'note updated in place');
select is(pg_temp.counts(current_setting('t.plan')::uuid), '2/2/2/0', 'minor edit changes nobody''s answer');
select pg_temp.login('maya');
select is((select public.edit_plan(current_setting('t.plan')::uuid, jsonb_build_object('note', 'Bring pencils too')) ->> 'changed'), 'false', 'an edit that changes nothing reports changed=false');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('colour', 'red')), 'P0001', 'unknown_field', 'unknown fields are refused');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('note', repeat('n', 501))), 'P0001', 'invalid_note', 'long note refused');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('end_local', to_char(pg_temp.lt(3, 14), 'YYYY-MM-DD"T"HH24:MI:SS'))),
                 'P0001', 'end_before_start', 'an end before the start is refused');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('start_local', to_char(pg_temp.lt(-2, 14), 'YYYY-MM-DD"T"HH24:MI:SS'), 'end_local', to_char(pg_temp.lt(-2, 16), 'YYYY-MM-DD"T"HH24:MI:SS'))),
                 'P0001', 'start_in_past', 'moving the start into the past is refused');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('start_local', '2027-03-14T02:30:00', 'end_local', '2027-03-14T04:00:00')),
                 'P0001', 'nonexistent_local_time', 'edit rejects nonexistent DST times too');

-- meeting point is material; combined edits reconfirm once
select is((select public.edit_plan(current_setting('t.plan')::uuid, jsonb_build_object('meeting_point', 'Stone footbridge', 'note', 'Meet at the bridge')) ->> 'revision'),
          '3', 'a meeting point change is material');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '1/2/2/1', 'only the Going invitee (jordan) needs to reconfirm the latest revision');

-- ---- locks: cancelled plans and started plans
update public.plans set state = 'cancelled' where id = current_setting('t.plan_b')::uuid;
select pg_temp.login('jordan');
select throws_ok(format($$select public.respond(%L, 1, 'going')$$, current_setting('t.plan_b')), 'P0001', 'plan_cancelled', 'cancelled plans refuse RSVPs');
reset role; select pg_temp.login('maya');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan_b'), jsonb_build_object('note', 'x')), 'P0001', 'plan_cancelled', 'cancelled plans refuse edits');
reset role;
update public.plan_revisions set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
 where plan_id = current_setting('t.plan')::uuid and revision = 3;
select pg_temp.login('jordan');
select throws_ok(format($$select public.respond(%L, 3, 'going')$$, current_setting('t.plan')), 'P0001', 'answers_locked', 'answers lock at the start time');
reset role; select pg_temp.login('maya');
select throws_ok(format($$select public.edit_plan(%L, %L)$$, current_setting('t.plan'), jsonb_build_object('meeting_point', 'Elsewhere')), 'P0001', 'plan_started', 'a started plan cannot be rescheduled');
reset role;

-- ---- pick -> plan (P0-10)
select pg_temp.login('maya');
select set_config('t.pk', public.create_pick(pg_temp.gid(), pg_temp.opts2('Sketch and stroll', 'Barton Springs swim'), now() + interval '24 hours')::text, true);
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'x', null, null, %L)$$, pg_temp.key(10), pg_temp.gid(), pg_temp.eid('Sketch and stroll'),
                 pg_temp.lt(6, 14), pg_temp.lt(6, 16), current_setting('t.pk')), 'P0001', 'pick_not_closed', 'a plan needs a closed pick');
select pg_temp.vote('maya', current_setting('t.pk')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('maya', current_setting('t.pk')::uuid, 'Barton Springs swim', 'no');
select pg_temp.login('maya'); select public.close_pick(current_setting('t.pk')::uuid);
select pg_temp.login('priya');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'x', null, null, %L)$$, pg_temp.key(10), pg_temp.gid(), pg_temp.eid('Sketch and stroll'),
                 pg_temp.lt(6, 14), pg_temp.lt(6, 16), current_setting('t.pk')), 'P0001', 'not_organizer', 'only the pick organizer can plan it');
select pg_temp.login('maya');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'x', null, null, %L)$$, pg_temp.key(10), pg_temp.gid(), pg_temp.eid('Barton Springs swim'),
                 pg_temp.lt(6, 14), pg_temp.lt(6, 16), current_setting('t.pk')), 'P0001', 'experience_mismatch', 'the plan must use the winning experience');
select set_config('t.plan_d', public.send_plan(pg_temp.key(10), pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(6, 14), pg_temp.lt(6, 16),
                   'Benches', null, null, current_setting('t.pk')::uuid)::text, true);
reset role;
select is((select state from public.picks where id = current_setting('t.pk')::uuid), 'planned', 'the pick becomes Planned');
select is((select pick_id from public.plans where id = current_setting('t.plan_d')::uuid), current_setting('t.pk')::uuid, 'the plan links back to its pick');
select is(pg_temp.counts(current_setting('t.plan_d')::uuid), '1/6/0/0', 'default recipients are every other group member (the late joiner included)');
select pg_temp.login('maya');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'x', null, null, %L)$$, pg_temp.key(11), pg_temp.gid(), pg_temp.eid('Sketch and stroll'),
                 pg_temp.lt(6, 14), pg_temp.lt(6, 16), current_setting('t.pk')), 'P0001', 'pick_already_planned', 'a pick can only be planned once');
select is(public.send_plan(pg_temp.key(10), pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(6, 14), pg_temp.lt(6, 16),
                           'Benches', null, null, current_setting('t.pk')::uuid)::text, current_setting('t.plan_d'),
          'a retry of the planning send returns the same plan, not an error');
select throws_ok(format($$select public.cancel_pick(%L)$$, current_setting('t.pk')), 'P0001', 'pick_not_cancellable', 'a planned pick cannot be cancelled');
reset role;

select * from finish();
rollback;
