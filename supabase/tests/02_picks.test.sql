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
-- P0-08 / P0-09 / P0-10: group pick, voting, closing, tie-breaker
-- =====================================================================================================
create function pg_temp.opts(variadic p text[]) returns jsonb language sql stable as
  $$ select jsonb_agg(jsonb_build_object('experience_id', pg_temp.eid(x)) order by ord) from unnest(p) with ordinality t(x, ord) $$;
create function pg_temp.opt(p_pick uuid, p_name text) returns uuid language sql stable security definer as
  $$ select o.id from public.pick_options o join public.experiences e on e.id = o.experience_id
      where o.pick_id = p_pick and e.name = p_name order by o.position limit 1 $$;
create function pg_temp.vote(u text, p_pick uuid, p_name text, v text) returns void language plpgsql as $$
begin
  perform pg_temp.login(u);
  perform public.cast_vote(pg_temp.opt(p_pick, p_name), v);
  execute 'reset role';
end $$;
create function pg_temp.pickstate(p_pick uuid) returns text language sql stable security definer as
  $$ select state from public.picks where id = p_pick $$;

select pg_temp.crew();
select pg_temp.mk('outsider');
insert into public.experiences (name, category, description, lat, lng, area, price_kind, price_min, price_max,
  timing_kind, hours_text, duration_min, meeting_point, source, checked_on)
select 'Extra ' || i, 'active', 'Filler.', 30.27, -97.74, 'Downtown', 'unknown', null, null,
       'unknown', null, 60, 'Somewhere', 'PLACEHOLDER: test', '2026-11-02' from generate_series(1, 3) i;

-- ---- who can create a pick; option count; deadline window
reset role; select pg_temp.login('jordan');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'P0001', 'account_required',
                 'a guest cannot start a pick');
reset role; select pg_temp.login('outsider');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'P0001', 'not_member',
                 'a non-member cannot start a pick');
reset role; select pg_temp.login('maya');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll')), 'P0001', 'invalid_option_count', '1 option rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim', 'Clay and conversation',
                              'Mount Bonnell sunset', 'Extra 1', 'Extra 2')), 'P0001', 'invalid_option_count', '6 options rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '30 minutes')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'P0001', 'invalid_deadline', 'deadline under 1 hour rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '8 days')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'P0001', 'invalid_deadline', 'deadline over 7 days rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours', 3)$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'P0001', 'invalid_star', 'star must point at an option');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 jsonb_build_array(jsonb_build_object('experience_id', gen_random_uuid()),
                                   jsonb_build_object('experience_id', gen_random_uuid()))),
                 'P0001', 'experience_unavailable', 'unknown experience rejected');

-- 1 hour and 7 days are the inclusive edges
select set_config('t.p', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'),
                   now() + interval '1 hour')::text, true);
select is(pg_temp.pickstate(current_setting('t.p')::uuid), 'open', 'a 1 hour deadline is accepted');
select public.cancel_pick(current_setting('t.p')::uuid);
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '7 days')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'a 7 day deadline is accepted');
select public.cancel_pick((select id from public.picks where state = 'open'));

-- ---- one open pick per group; retry returns the same pick
select set_config('t.p1', public.create_pick(pg_temp.gid(),
                   pg_temp.opts('Sketch and stroll', 'Clay and conversation', 'Barton Springs swim'),
                   now() + interval '24 hours', 1)::text, true);
select is((select count(*)::int from public.pick_options where pick_id = current_setting('t.p1')::uuid), 3, 'pick has 3 options');
select is((select array_agg(position order by position) from public.pick_options where pick_id = current_setting('t.p1')::uuid),
          array[1, 2, 3], 'options positions follow the order given');
select is((select starred_option_id from public.picks where id = current_setting('t.p1')::uuid),
          pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll'), 'the star points at the first option');
select is((select count(*)::int from public.option_tallies where pick_id = current_setting('t.p1')::uuid), 3, 'tally rows exist from the start');
select is(public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Clay and conversation', 'Barton Springs swim'),
                              now() + interval '48 hours', 1)::text, current_setting('t.p1'),
          'repeating the same create returns the same pick (retry-safe)');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Mount Bonnell sunset')), 'P0001', 'open_pick_exists',
                 'a second open pick for the group is blocked');
reset role; select pg_temp.login('priya');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Clay and conversation', 'Barton Springs swim')), 'P0001', 'open_pick_exists',
                 'another member repeating the same options is still blocked');
select throws_ok(format($$select public.cancel_pick(%L)$$, current_setting('t.p1')), 'P0001', 'not_organizer',
                 'only the organizer can cancel');
select throws_ok(format($$select public.close_pick(%L)$$, current_setting('t.p1')), 'P0001', 'not_organizer',
                 'only the organizer can close early');
select throws_ok(format($$select public.add_option(%L, %L)$$, current_setting('t.p1'), pg_temp.eid('Mount Bonnell sunset')),
                 'P0001', 'not_organizer', 'only the organizer can add an option');

-- ---- voting: guests vote, invalid values, privacy, tallies
reset role;
select pg_temp.vote('maya', current_setting('t.p1')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('maya', current_setting('t.p1')::uuid, 'Clay and conversation', 'yes');
select pg_temp.vote('maya', current_setting('t.p1')::uuid, 'Barton Springs swim', 'maybe');
select pg_temp.vote('jordan', current_setting('t.p1')::uuid, 'Sketch and stroll', 'yes');   -- guest
select pg_temp.vote('jordan', current_setting('t.p1')::uuid, 'Clay and conversation', 'yes');
select pg_temp.vote('jordan', current_setting('t.p1')::uuid, 'Barton Springs swim', 'no');
select pg_temp.login('priya');
select throws_ok(format($$select public.cast_vote(%L, 'definitely')$$, pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')),
                 'P0001', 'invalid_value', 'only yes / maybe / no');
reset role; select pg_temp.login('outsider');
select throws_ok(format($$select public.cast_vote(%L, 'yes')$$, pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')),
                 'P0001', 'not_member', 'a non-member cannot vote');
reset role;
select is((select complete from public.pick_voter_status where pick_id = current_setting('t.p1')::uuid and user_id = pg_temp.uid('jordan')),
          true, 'voting on every option marks the voter complete');

-- a member who joins while the pick is open can vote too
select pg_temp.mk('late');
select pg_temp.login('late'); select public.join_group(pg_temp.code());
select lives_ok(format($$select public.cast_vote(%L, 'maybe')$$, pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')),
                'a member who joined mid-pick can vote');
reset role;
select is((select count(*)::int from public.pick_voter_status where pick_id = current_setting('t.p1')::uuid), 3, 'maya, jordan, late have status rows');
select is((select complete from public.pick_voter_status where pick_id = current_setting('t.p1')::uuid and user_id = pg_temp.uid('late')),
          false, 'a partial voter is not complete');
-- clear and change
select pg_temp.login('late');
select public.cast_vote(pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll'), null);
reset role;
select is((select count(*)::int from public.votes where user_id = pg_temp.uid('late')), 0, 'NULL clears a vote');
select is((select maybe from public.option_tallies where option_id = pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')),
          0, 'tally follows the cleared vote');
-- remove the late voter so the worked example below is exactly the six crew members
delete from public.group_members where user_id = pg_temp.uid('late');

-- remaining crew votes (worked example from P0-09)
select pg_temp.vote('sam', current_setting('t.p1')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('sam', current_setting('t.p1')::uuid, 'Clay and conversation', 'no');
select pg_temp.vote('sam', current_setting('t.p1')::uuid, 'Barton Springs swim', 'maybe');
select pg_temp.vote('priya', current_setting('t.p1')::uuid, 'Sketch and stroll', 'maybe');
select pg_temp.vote('priya', current_setting('t.p1')::uuid, 'Clay and conversation', 'yes');
select pg_temp.vote('priya', current_setting('t.p1')::uuid, 'Barton Springs swim', 'yes');
select pg_temp.vote('luis', current_setting('t.p1')::uuid, 'Sketch and stroll', 'maybe');
select pg_temp.vote('luis', current_setting('t.p1')::uuid, 'Clay and conversation', 'yes');
select pg_temp.vote('luis', current_setting('t.p1')::uuid, 'Barton Springs swim', 'maybe');
select pg_temp.vote('tess', current_setting('t.p1')::uuid, 'Sketch and stroll', 'no');
select pg_temp.vote('tess', current_setting('t.p1')::uuid, 'Clay and conversation', 'no');
select pg_temp.vote('tess', current_setting('t.p1')::uuid, 'Barton Springs swim', 'no');

select is((select yes || '/' || maybe || '/' || no from public.option_tallies
            where option_id = pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')), '3/2/1', 'Sketch and stroll: 3 Yes, 2 Maybe, 1 No');
select is((select yes || '/' || maybe || '/' || no from public.option_tallies
            where option_id = pg_temp.opt(current_setting('t.p1')::uuid, 'Clay and conversation')), '4/0/2', 'Clay and conversation: 4 Yes, 2 No');
select is((select yes || '/' || maybe || '/' || no from public.option_tallies
            where option_id = pg_temp.opt(current_setting('t.p1')::uuid, 'Barton Springs swim')), '1/3/2', 'Barton Springs swim: 1 Yes, 3 Maybe, 2 No');
select is((select count(*)::int from public.pick_voter_status where pick_id = current_setting('t.p1')::uuid and complete), 6, '6 of 6 voted');

-- privacy: a member sees tallies and who voted, but only their own votes
reset role; select pg_temp.login('priya');
select is((select count(*)::int from public.votes), 3, 'a member can read only their own vote rows');
select is((select count(*)::int from public.option_tallies where pick_id = current_setting('t.p1')::uuid), 3, 'a member reads the tallies');
select is((select count(*)::int from public.pick_voter_status where complete), 6, 'a member sees who has voted');
reset role; select pg_temp.login('outsider');
select is((select count(*)::int from public.picks) + (select count(*)::int from public.option_tallies)
          + (select count(*)::int from public.pick_options) + (select count(*)::int from public.pick_voter_status), 0,
          'a non-member sees no pick data at all');
reset role;

-- ---- close now: worked example
select pg_temp.login('maya');
select is((select public.close_pick(current_setting('t.p1')::uuid) ->> 'tie_rule'),
          'Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).', 'close_pick returns the tie sentence');
reset role;
select is((select state from public.picks where id = current_setting('t.p1')::uuid), 'closed', 'pick is closed');
select is((select winner_option_id from public.picks where id = current_setting('t.p1')::uuid),
          pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll'), 'Sketch and stroll wins');
select is((select tie_rule from public.picks where id = current_setting('t.p1')::uuid),
          'Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).', 'stored tie_rule is the exact sentence');
select is((select array_agg(e.name order by (t.yes * 2 + t.maybe) desc, t.no asc, o.position asc)
             from public.option_tallies t join public.pick_options o on o.id = t.option_id
             join public.experiences e on e.id = o.experience_id where t.pick_id = current_setting('t.p1')::uuid),
          array['Sketch and stroll', 'Clay and conversation', 'Barton Springs swim'], 'final order: Sketch, Clay, Barton Springs third');
select is((select (t.yes * 2 + t.maybe) from public.option_tallies t
            where t.option_id = pg_temp.opt(current_setting('t.p1')::uuid, 'Barton Springs swim')), 5, 'Barton Springs swim scores 5');
select pg_temp.login('maya');
select is((select public.close_pick(current_setting('t.p1')::uuid) ->> 'tie_rule'),
          'Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).', 'closing twice is idempotent');
select throws_ok($$select public.close_due_picks()$$, '42501', null, 'clients cannot call close_due_picks (cron only)');
reset role;
select pg_temp.login('priya');
select throws_ok(format($$select public.cast_vote(%L, 'yes')$$, pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')),
                 'P0001', 'voting_closed', 'votes after closing fail with voting_closed');
reset role;

-- ---- another pick may open once the first is closed; cancel; planned picks cannot be cancelled
select pg_temp.login('maya');
select set_config('t.p2', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'),
                   now() + interval '24 hours')::text, true);
select is(pg_temp.pickstate(current_setting('t.p2')::uuid), 'open', 'a new pick opens after the previous one closed');

-- ---- add_option: limits, voter status reset, closed
select pg_temp.vote('jordan', current_setting('t.p2')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('jordan', current_setting('t.p2')::uuid, 'Barton Springs swim', 'yes');
select is((select complete from public.pick_voter_status where pick_id = current_setting('t.p2')::uuid and user_id = pg_temp.uid('jordan')),
          true, 'jordan has fully voted');
select pg_temp.login('maya');
select set_config('t.o', public.add_option(current_setting('t.p2')::uuid, pg_temp.eid('Mount Bonnell sunset'))::text, true);
select is((select position from public.pick_options where id = current_setting('t.o')::uuid), 3,
          'a new option gets the next position');
reset role;
select is((select complete from public.pick_voter_status where pick_id = current_setting('t.p2')::uuid and user_id = pg_temp.uid('jordan')),
          false, 'adding an option makes earlier voters incomplete again');
select pg_temp.login('maya');
select public.add_option(current_setting('t.p2')::uuid, pg_temp.eid('Extra 1'));
select public.add_option(current_setting('t.p2')::uuid, pg_temp.eid('Extra 2'));
select throws_ok(format($$select public.add_option(%L, %L)$$, current_setting('t.p2'), pg_temp.eid('Extra 3')),
                 'P0001', 'too_many_options', 'a sixth option is refused');
select is((select count(*)::int from public.option_tallies where pick_id = current_setting('t.p2')::uuid), 5, 'new options get tally rows');

-- ---- votes after the deadline fail even before the cron job has closed the pick; cron closes it
reset role;
update public.picks set deadline = now() - interval '1 minute' where id = current_setting('t.p2')::uuid;
select pg_temp.login('jordan');
select throws_ok(format($$select public.cast_vote(%L, 'no')$$, pg_temp.opt(current_setting('t.p2')::uuid, 'Sketch and stroll')),
                 'P0001', 'voting_closed', 'a vote after the deadline is refused');
reset role;
select is(pg_temp.pickstate(current_setting('t.p2')::uuid), 'open', 'still open until the job runs');
select is(public.close_due_picks(), 1, 'close_due_picks closes the overdue pick');
select is(pg_temp.pickstate(current_setting('t.p2')::uuid), 'closed', 'pick closed by the job');
select is(public.close_due_picks(), 0, 'the job closes a pick only once');
select pg_temp.login('maya');
select throws_ok(format($$select public.add_option(%L, %L)$$, current_setting('t.p2'), pg_temp.eid('Extra 3')),
                 'P0001', 'voting_closed', 'cannot add options to a closed pick');
reset role;

-- ---- tie-breaker rules in order
select pg_temp.login('maya');
select set_config('t.p3', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'),
                   now() + interval '24 hours', 2)::text, true);
select pg_temp.vote('maya', current_setting('t.p3')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('maya', current_setting('t.p3')::uuid, 'Barton Springs swim', 'yes');
select pg_temp.login('maya');
select is((select public.close_pick(current_setting('t.p3')::uuid) ->> 'tie_rule'),
          'Tied on points (2) and No votes (0). Barton Springs swim was Maya''s starred option.', 'equal points and No: the star decides');
reset role;
select is((select winner_option_id from public.picks where id = current_setting('t.p3')::uuid),
          pg_temp.opt(current_setting('t.p3')::uuid, 'Barton Springs swim'), 'the starred option wins');

select pg_temp.login('maya');
select set_config('t.p4', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'),
                   now() + interval '24 hours')::text, true);
select pg_temp.vote('maya', current_setting('t.p4')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('maya', current_setting('t.p4')::uuid, 'Barton Springs swim', 'yes');
select pg_temp.login('maya');
select is((select public.close_pick(current_setting('t.p4')::uuid) ->> 'tie_rule'),
          'Tied on points (2) and No votes (0), and no star decided it. Sketch and stroll was added first.', 'no star: the first added option wins');

select set_config('t.p5', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'),
                   now() + interval '24 hours')::text, true);
select pg_temp.vote('maya', current_setting('t.p5')::uuid, 'Sketch and stroll', 'yes');
select pg_temp.vote('maya', current_setting('t.p5')::uuid, 'Barton Springs swim', 'no');
select pg_temp.login('maya');
select is((select public.close_pick(current_setting('t.p5')::uuid) ->> 'tie_rule'),
          'Sketch and stroll has the highest score: 2 points to 0.', 'outright winner sentence');

-- ---- nobody voted: no winner, organizer chooses
select set_config('t.p6', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'),
                   now() + interval '24 hours')::text, true);
select is((select public.close_pick(current_setting('t.p6')::uuid) ->> 'winner_option_id'), null, 'no votes: no winner');
reset role;
select is((select tie_rule from public.picks where id = current_setting('t.p6')::uuid),
          'No votes were cast. The organizer chooses an option.', 'no votes: explanatory sentence');
select pg_temp.login('priya');
select throws_ok(format($$select public.override_pick(%L, %L)$$, current_setting('t.p6'), pg_temp.opt(current_setting('t.p6')::uuid, 'Sketch and stroll')),
                 'P0001', 'not_organizer', 'only the organizer chooses');
reset role; select pg_temp.login('maya');
select throws_ok(format($$select public.override_pick(%L, %L)$$, current_setting('t.p6'), pg_temp.opt(current_setting('t.p1')::uuid, 'Sketch and stroll')),
                 'P0001', 'option_not_found', 'cannot choose an option from another pick');
select lives_ok(format($$select public.override_pick(%L, %L)$$, current_setting('t.p6'), pg_temp.opt(current_setting('t.p6')::uuid, 'Barton Springs swim')),
                'organizer chooses an option');
reset role;
select is((select override_option_id from public.picks where id = current_setting('t.p6')::uuid),
          pg_temp.opt(current_setting('t.p6')::uuid, 'Barton Springs swim'), 'override stored');

-- ---- cancel; two options may be the same experience at different times
select pg_temp.login('maya');
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 jsonb_build_array(
                   jsonb_build_object('experience_id', pg_temp.eid('Sketch and stroll'), 'proposed_start', now() + interval '3 days'),
                   jsonb_build_object('experience_id', pg_temp.eid('Sketch and stroll'), 'proposed_start', now() + interval '4 days'))),
                'two options may be the same experience at different times');
select public.cancel_pick((select id from public.picks where state = 'open'));
select is((select count(*)::int from public.picks where state = 'cancelled' and group_id = pg_temp.gid()) >= 2, true, 'cancelled picks are kept');
reset role;
select * from finish();
rollback;
