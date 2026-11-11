begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u))::text, true) $$;
create function pg_temp.opts(n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('experience_id', pg_temp.id('venue'),
    'proposed_start', (now() + make_interval(days => i))::text)) from generate_series(1, n) i $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','u1','u2','u3','u4','u5','late','outsider']) n;
update profiles p set display_name = n from unnest(array['maya','u1','u2','u3','u4','u5','late','outsider']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('g')), (pg_temp.id('g2'), 'G2', pg_temp.id('maya'), pg_temp.id('g2'));
insert into group_members (group_id, user_id, role) select pg_temp.id('g'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','u1','u2','u3','u4','u5']) n;
insert into group_members (group_id, user_id, role) values (pg_temp.id('g2'), pg_temp.id('maya'), 'owner');
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('venue'), 'V', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: pick test');
insert into experiences (id, name, category, price_kind, timing_kind, source, status)
  values (pg_temp.id('hidden'), 'H', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: pick test', 'draft');

set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day')$$, pg_temp.id('g'), pg_temp.opts(1)),
  'P0001', 'invalid_option_count', '1 option rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day')$$, pg_temp.id('g'), pg_temp.opts(6)),
  'P0001', 'invalid_option_count', '6 options rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '30 minutes')$$, pg_temp.id('g'), pg_temp.opts(2)),
  'P0001', 'invalid_deadline', 'Deadline under 1 h rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '8 days')$$, pg_temp.id('g'), pg_temp.opts(2)),
  'P0001', 'invalid_deadline', 'Deadline over 7 days rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day', 3)$$, pg_temp.id('g'), pg_temp.opts(2)),
  'P0001', 'invalid_starred', 'Star outside options rejected');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day')$$, pg_temp.id('g'),
  jsonb_build_array(jsonb_build_object('experience_id', pg_temp.id('hidden')), jsonb_build_object('experience_id', pg_temp.id('venue')))),
  'P0001', 'experience_not_found', 'Unpublished experience rejected');
select is((select count(*) from picks), 0::bigint, 'Rejected creates leave nothing behind');
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '1 hour')$$, pg_temp.id('g2'), pg_temp.opts(2)),
  'Exactly 1 hour accepted (with slack)');
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day', 2, %L)$$, pg_temp.id('g'), pg_temp.opts(3), pg_temp.id('ck1')),
  'Member creates a pick with 3 options and a star');
reset role;
select is((select count(*) from pick_options o join picks p on p.id = o.pick_id where p.group_id = pg_temp.id('g')), 3::bigint, '3 options stored');
select is((select position from pick_options where id = (select starred_option_id from picks where group_id = pg_temp.id('g'))), 2, 'Star is on option 2');
select is((select count(*) from option_tallies t join pick_options o on o.id = t.option_id join picks p on p.id = o.pick_id where p.group_id = pg_temp.id('g')), 3::bigint, 'Tally row per option');
select is((select count(*) from pick_voter_status s join picks p on p.id = s.pick_id where p.group_id = pg_temp.id('g') and not s.complete), 6::bigint, 'All 6 members start not voted');
select is((select organizer_id from picks where group_id = pg_temp.id('g')), pg_temp.id('maya'), 'Creator is organizer');
create temp table the_pick as select id from picks where group_id = pg_temp.id('g');
create temp table the_pick2 as select id from picks where group_id = pg_temp.id('g2');
grant select on the_pick, the_pick2 to authenticated;

set local role authenticated;
select pg_temp.as_user('maya');
select is(public.create_pick(pg_temp.id('g'), pg_temp.opts(3), now() + interval '1 day', 2, pg_temp.id('ck1')),
  (select id from the_pick), 'Retry with same client_key returns same pick');
select is((select count(*) from picks where group_id = pg_temp.id('g')), 1::bigint, 'Retry did not duplicate');
select pg_temp.as_user('u1');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day', null, %L)$$, pg_temp.id('g'), pg_temp.opts(2), pg_temp.id('ck2')),
  'P0001', 'open_pick_exists', 'Second open pick blocked');
select pg_temp.as_user('outsider');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day')$$, pg_temp.id('g'), pg_temp.opts(2)),
  '42501', 'not_a_member', 'Non-member cannot create');
select throws_ok(format($$select public.add_option(%L, %L)$$, (select id from the_pick), pg_temp.id('venue')),
  'P0001', 'pick_not_found', 'Non-member cannot add option');

-- add_option
select pg_temp.as_user('u1');
select throws_ok(format($$select public.add_option(%L, %L)$$, (select id from the_pick), pg_temp.id('venue')),
  '42501', 'not_organizer', 'Only the organizer adds options');
select pg_temp.as_user('maya');
select throws_ok(format($$select public.add_option(%L, %L)$$, (select id from the_pick), pg_temp.id('hidden')),
  'P0001', 'experience_not_found', 'Unpublished experience rejected on add');
select lives_ok(format($$select public.add_option(%L, %L, now() + interval '9 days')$$, (select id from the_pick), pg_temp.id('venue')), 'Organizer adds a 4th option');
select lives_ok(format($$select public.add_option(%L, %L, now() + interval '20 days')$$, (select id from the_pick), pg_temp.id('venue')), '5th option');
select throws_ok(format($$select public.add_option(%L, %L, now() + interval '21 days')$$, (select id from the_pick), pg_temp.id('venue')),
  'P0001', 'too_many_options', '6th option rejected');
select is((select count(*) from pick_options where pick_id = (select id from the_pick)), 5::bigint, 'Pick has 5 options');

-- cast_vote
reset role;
create temp table opt as select o.id, o.position from pick_options o where o.pick_id = (select id from the_pick);
grant select on opt to authenticated;
set local role authenticated;
select pg_temp.as_user('u1');
select throws_ok(format($$select public.cast_vote(%L, 'love')$$, (select id from opt where position = 1)), 'P0001', 'invalid_vote', 'Bad value rejected');
select throws_ok($$select public.cast_vote(gen_random_uuid(), 'yes')$$, 'P0001', 'option_not_found', 'Unknown option rejected');
select lives_ok(format($$select public.cast_vote(%L, 'yes')$$, (select id from opt where position = 1)), 'u1 votes yes');
select lives_ok(format($$select public.cast_vote(%L, 'yes')$$, (select id from opt where position = 1)), 'Same vote again is idempotent');
select is((select yes from option_tallies where option_id = (select id from opt where position = 1)), 1, 'Tally shows 1 yes');
select lives_ok(format($$select public.cast_vote(%L, 'no')$$, (select id from opt where position = 1)), 'u1 changes to no');
select is((select (yes, maybe, no)::text from option_tallies where option_id = (select id from opt where position = 1)), '(0,0,1)', 'Tally moved yes to no');
select is((select complete from pick_voter_status where user_id = pg_temp.id('u1')), false, 'Voted on 1 of 5: not complete');
select public.cast_vote(id, 'maybe') from opt where position > 1;
select is((select complete from pick_voter_status where user_id = pg_temp.id('u1')), true, 'Voted on all 5: complete');
select public.cast_vote((select id from opt where position = 5), null);
select is((select maybe from option_tallies where option_id = (select id from opt where position = 5)), 0, 'null clears and tally drops');
select is((select complete from pick_voter_status where user_id = pg_temp.id('u1')), false, 'Clearing makes voter incomplete again');
select public.cast_vote((select id from opt where position = 5), 'yes');
select is((select complete from pick_voter_status where user_id = pg_temp.id('u1')), true, 'Complete again');
select pg_temp.as_user('outsider');
select throws_ok(format($$select public.cast_vote(%L, 'yes')$$, (select id from opt where position = 1)), '42501', 'not_a_member', 'Non-member cannot vote');

-- Vote privacy (C1): nobody reads another person's votes row
select pg_temp.as_user('u2');
select public.cast_vote((select id from opt where position = 1), 'yes');
select is((select count(*) from votes), 1::bigint, 'u2 sees only their own vote row');
select is((select count(*) from votes where user_id = pg_temp.id('u1')), 0::bigint, 'u2 cannot read u1 votes');
select pg_temp.as_user('maya');
select is((select count(*) from votes), 0::bigint, 'Organizer sees no one else''s votes');
select is((select (yes, no)::text from option_tallies where option_id = (select id from opt where position = 1)), '(1,1)', 'Tallies stay readable to members');
select throws_ok($$insert into votes values (gen_random_uuid(), gen_random_uuid(), 'yes')$$, '42501', null, 'Clients cannot write votes directly');
select throws_ok($$update option_tallies set yes = 99$$, '42501', null, 'Clients cannot write tallies directly');

-- Mid-pick joiner can vote and counts as not fully voted
reset role;
insert into group_members (group_id, user_id) values (pg_temp.id('g'), pg_temp.id('late'));
set local role authenticated;
select pg_temp.as_user('late');
select public.cast_vote((select id from opt where position = 1), 'maybe');
select is((select complete from pick_voter_status where user_id = pg_temp.id('late')), false, 'Joiner voted 1 of 5: not complete');
select is((select maybe from option_tallies where option_id = (select id from opt where position = 1)), 1, 'Joiner vote counted');

-- Six voters on one option give a tally of 6. The pick row lock serialises concurrent votes;
-- real parallel sessions need the Postgres integration run (PGlite is single connection).
reset role;
delete from votes;
update option_tallies set yes = 0, maybe = 0, no = 0;
set local role authenticated;
select pg_temp.as_user('maya'); select public.cast_vote((select id from opt where position = 1), 'yes');
select pg_temp.as_user('u1'); select public.cast_vote((select id from opt where position = 1), 'yes');
select pg_temp.as_user('u2'); select public.cast_vote((select id from opt where position = 1), 'yes');
select pg_temp.as_user('u3'); select public.cast_vote((select id from opt where position = 1), 'yes');
select pg_temp.as_user('u4'); select public.cast_vote((select id from opt where position = 1), 'yes');
select pg_temp.as_user('u5'); select public.cast_vote((select id from opt where position = 1), 'yes');
select is((select yes from option_tallies where option_id = (select id from opt where position = 1)), 6, 'Six votes tally to 6');
reset role;
select is((select count(*) from votes where option_id = (select id from opt where position = 1)), 6::bigint, 'Tally matches vote rows');

-- Adding an option makes everyone not fully voted again
update pick_voter_status set complete = true where pick_id = (select id from the_pick2);
set local role authenticated;
select pg_temp.as_user('maya');
select public.add_option((select id from the_pick2), pg_temp.id('venue'), now() + interval '30 days');
reset role;
select is((select count(*) from pick_voter_status where pick_id = (select id from the_pick2) and complete), 0::bigint, 'Adding an option resets completeness');

-- Closed picks
update picks set state = 'closed', closed_at = now() where id = (select id from the_pick);
set local role authenticated;
select pg_temp.as_user('u1');
select throws_ok(format($$select public.cast_vote(%L, 'yes')$$, (select id from opt where position = 1)), 'P0001', 'voting_closed', 'Vote after close fails');
select pg_temp.as_user('maya');
select throws_ok(format($$select public.add_option(%L, %L)$$, (select id from the_pick), pg_temp.id('venue')), 'P0001', 'voting_closed', 'Add option after close fails');
reset role;
update picks set state = 'open', closed_at = null, deadline = now() - interval '1 second' where id = (select id from the_pick);
set local role authenticated;
select pg_temp.as_user('u1');
select throws_ok(format($$select public.cast_vote(%L, 'yes')$$, (select id from opt where position = 1)), 'P0001', 'voting_closed', 'Vote after deadline fails before the job closes it');

-- Signed out and anon
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.cast_vote(gen_random_uuid(), 'yes')$$, '28000', 'not_authenticated', 'Signed-out cannot vote');
reset role;
set local role anon;
select throws_ok($$select public.cast_vote(gen_random_uuid(), 'yes')$$, '42501', null, 'anon has no execute');
reset role;
select * from finish();
rollback;
