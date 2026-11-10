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
  -- tests build their own catalog; this also clears the seed data (rolled back at the end)
  delete from public.experiences;
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
-- Demo script D1-D8 (docs/spec.md "Demo acceptance") through the server functions, with three phones:
-- Maya (account) and Jordan and Sam (guests). The app-side steps are covered by the app tests; this is the backend half.
-- =====================================================================================================
create function pg_temp.lt(p_days int, p_hour int) returns timestamp language sql stable as
  $$ select date_trunc('day', now() at time zone 'America/Chicago') + p_days * interval '1 day' + p_hour * interval '1 hour' $$;
create function pg_temp.opts(variadic p text[]) returns jsonb language sql stable as
  $$ select jsonb_agg(jsonb_build_object('experience_id', pg_temp.eid(x)) order by ord) from unnest(p) with ordinality t(x, ord) $$;
create function pg_temp.opt(p_pick uuid, p_name text) returns uuid language sql stable security definer as
  $$ select o.id from public.pick_options o join public.experiences e on e.id = o.experience_id where o.pick_id = p_pick and e.name = p_name limit 1 $$;
create function pg_temp.vote(u text, p_pick uuid, p_name text, v text) returns void language plpgsql as $$
begin
  perform pg_temp.login(u);
  perform public.cast_vote(pg_temp.opt(p_pick, p_name), v);
  execute 'reset role';
end $$;
create function pg_temp.counts(p_plan uuid) returns text language sql stable security definer as $$
  select count(*) filter (where status = 'going') || '/' || count(*) filter (where status = 'awaiting') || '/'
      || count(*) filter (where status = 'cant_go') || '/' || count(*) filter (where status = 'needs_reconfirm')
    from public.rsvps where plan_id = p_plan and removed_at is null $$;

select pg_temp.world();   -- Maya (account), Jordan and Sam (guests), plus unused extras and the catalog

-- ---- D1: Maya signs in and creates "Saturday crew"
select pg_temp.login('maya');
select set_config('t.group', (public.create_group('Saturday crew') ->> 'group_id'), true);
reset role;
select ok(pg_temp.code() ~ '^[A-HJ-NP-Z2-9]{6}$', 'D1: the group exists and shows a 6-character join code');

-- ---- D2: Jordan and Sam join as guests; both appear in Maya's member list, marked guest
select pg_temp.login('jordan'); select is((select public.join_group(pg_temp.code()) ->> 'status'), 'joined', 'D2: Jordan joins by code');
select pg_temp.login('sam');    select is((select public.join_group(pg_temp.code()) ->> 'status'), 'joined', 'D2: Sam joins by code');
select pg_temp.login('maya');
select is((select count(*)::int from public.group_members where removed_at is null), 3, 'D2: the roster has three people');
select is((select array_agg(p.display_name order by p.display_name) from public.group_members gm join public.profiles p on p.id = gm.user_id
            where p.is_guest), array['Jordan', 'Sam'], 'D2: Jordan and Sam are marked guest');

-- ---- D3: Maya opens a pick with three options (default 24 h); the guests see it
select set_config('t.pick', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim', 'Mount Bonnell sunset'), now() + interval '24 hours')::text, true);
select is((select count(*)::int from public.pick_options where pick_id = current_setting('t.pick')::uuid), 3, 'D3: the pick shows 3 options');
select pg_temp.login('jordan');
select is((select count(*)::int from public.picks where state = 'open'), 1, 'D3: Jordan (guest) sees the open pick in his Plans hub');
select pg_temp.login('sam');
select is((select count(*)::int from public.pick_options), 3, 'D3: Sam (guest) sees its options');

-- ---- D4: all three vote Yes / Maybe / No; tallies reach every phone
select pg_temp.vote('maya', current_setting('t.pick')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('maya', current_setting('t.pick')::uuid, 'Barton Springs swim', 'maybe');
select pg_temp.vote('maya', current_setting('t.pick')::uuid, 'Mount Bonnell sunset', 'no');
select pg_temp.vote('jordan', current_setting('t.pick')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('jordan', current_setting('t.pick')::uuid, 'Barton Springs swim', 'yes');
select pg_temp.vote('jordan', current_setting('t.pick')::uuid, 'Mount Bonnell sunset', 'maybe');
select pg_temp.vote('sam', current_setting('t.pick')::uuid, 'Sketch and stroll', 'maybe');
select pg_temp.vote('sam', current_setting('t.pick')::uuid, 'Barton Springs swim', 'no');
select pg_temp.vote('sam', current_setting('t.pick')::uuid, 'Mount Bonnell sunset', 'yes');
select pg_temp.login('sam');
select is((select string_agg(e.name || ' ' || t.yes || '/' || t.maybe || '/' || t.no, '; ' order by o.position)
             from public.option_tallies t join public.pick_options o on o.id = t.option_id join public.experiences e on e.id = o.experience_id),
          'Sketch and stroll 2/1/0; Barton Springs swim 1/1/1; Mount Bonnell sunset 1/1/1', 'D4: every phone reads the same tallies');
select is((select count(*)::int from public.pick_voter_status where complete), 3, 'D4: 3 of 3 voted');
select is((select count(*)::int from public.votes), 3, 'D4: but a phone can read only its own votes');

-- ---- D5: Maya taps Close now; every phone shows the same winner and sentence
select pg_temp.login('maya'); select public.close_pick(current_setting('t.pick')::uuid);
select pg_temp.login('maya');   select set_config('t.r_maya',   (select winner_option_id::text || '|' || tie_rule from public.picks where id = current_setting('t.pick')::uuid), true);
select pg_temp.login('jordan'); select set_config('t.r_jordan', (select winner_option_id::text || '|' || tie_rule from public.picks where id = current_setting('t.pick')::uuid), true);
select pg_temp.login('sam');    select set_config('t.r_sam',    (select winner_option_id::text || '|' || tie_rule from public.picks where id = current_setting('t.pick')::uuid), true);
reset role;
select ok(current_setting('t.r_maya') = current_setting('t.r_jordan') and current_setting('t.r_jordan') = current_setting('t.r_sam'), 'D5: all three phones show the same result');
select is((select tie_rule from public.picks where id = current_setting('t.pick')::uuid), 'Sketch and stroll has the highest score: 5 points to 3.', 'D5: the deciding rule is named');

-- ---- D6: Maya drafts the plan from the winner, reviews it and sends
select pg_temp.login('maya');
select set_config('t.plan', public.send_plan(md5('demo-key')::uuid, pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14),
                   pg_temp.lt(3, 14) + interval '90 minutes', 'Benches at the W 3rd St trailhead', null, null, current_setting('t.pick')::uuid)::text, true);
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '1/2/0/0', 'D6: 1 Going, 2 Awaiting reply');
select is((select state from public.picks where id = current_setting('t.pick')::uuid), 'planned', 'D6: the pick is now Planned');
select pg_temp.login('jordan');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('jordan')), 'awaiting', 'D6: Jordan (guest) has it under Needs your response');
select pg_temp.login('sam');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('sam')), 'awaiting', 'D6: Sam (guest) has it under Needs your response');

-- ---- T04: a retry of the same send (network cut mid-send) creates exactly one plan
select pg_temp.login('maya');
select is(public.send_plan(md5('demo-key')::uuid, pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14),
                           pg_temp.lt(3, 14) + interval '90 minutes', 'Benches at the W 3rd St trailhead', null, null, current_setting('t.pick')::uuid)::text,
          current_setting('t.plan'), 'T04: the retry returns the same plan');
reset role;
select is((select count(*)::int from public.plans), 1, 'T04: exactly one plan');
select is((select count(*)::int from public.rsvps where plan_id = current_setting('t.plan')::uuid), 3, 'T04: exactly one invitation per person');

-- ---- D7: Jordan taps Going, Sam taps Can't go; counts on all phones
select pg_temp.login('jordan'); select public.respond(current_setting('t.plan')::uuid, 1, 'going');
select pg_temp.login('sam');    select public.respond(current_setting('t.plan')::uuid, 1, 'cant_go');
select is((select count(*) filter (where status = 'going') || '/' || count(*) filter (where status = 'awaiting') || '/' || count(*) filter (where status = 'cant_go')
             from public.rsvps where plan_id = current_setting('t.plan')::uuid), '2/0/1', 'D7: Sam sees 2 Going, 0 Awaiting, 1 Can''t go');
select pg_temp.login('jordan');
select is((select count(*) filter (where status = 'going') || '/' || count(*) filter (where status = 'awaiting') || '/' || count(*) filter (where status = 'cant_go')
             from public.rsvps where plan_id = current_setting('t.plan')::uuid), '2/0/1', 'D7: Jordan sees the same counts');

-- ---- D8: Maya moves the start one hour later; Jordan must reconfirm, sees old and new, and counts return to 2 Going
select pg_temp.login('maya');
select is((select public.edit_plan(current_setting('t.plan')::uuid, jsonb_build_object(
             'start_local', to_char(pg_temp.lt(3, 15), 'YYYY-MM-DD"T"HH24:MI:SS'),
             'end_local', to_char(pg_temp.lt(3, 15) + interval '90 minutes', 'YYYY-MM-DD"T"HH24:MI:SS'))) ->> 'needs_reconfirm'), '1',
          'D8: the organizer is told 1 Going invitee will need to reconfirm');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '1/0/1/1', 'D8: Jordan is Needs reconfirmation (the organizer stays Going)');
select pg_temp.login('jordan');
select is((select status from public.rsvps where plan_id = current_setting('t.plan')::uuid and user_id = pg_temp.uid('jordan')), 'needs_reconfirm', 'D8: Jordan sees that he must reconfirm');
select is((select count(*)::int from public.plan_revisions where plan_id = current_setting('t.plan')::uuid), 2, 'D8: Jordan can read the old and the new revision');
select is((select (select start_at from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 2)
                 - (select start_at from public.plan_revisions where plan_id = current_setting('t.plan')::uuid and revision = 1)), interval '1 hour', 'D8: the new time is one hour later');
select throws_ok(format($$select public.respond(%L, 1, 'going')$$, current_setting('t.plan')), 'P0001', 'stale_revision', 'D8: an answer from a screen opened before the change is rejected');
select public.respond(current_setting('t.plan')::uuid, 2, 'going');
reset role;
select is(pg_temp.counts(current_setting('t.plan')::uuid), '2/0/1/0', 'D8: after Jordan taps Going again the counts return to 2 Going');

select * from finish();
rollback;
