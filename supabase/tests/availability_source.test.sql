-- TEC-136 part 2 (P1-02 backend, decision N13): set_availability writes calendar answers, only with a share.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.tally(o text) returns text language sql as $$
  select free::int || '/' || busy::int from availability_tallies where option_id = pg_temp.id(o) $$;
create function pg_temp.row_of(u text, o text) returns text language sql as $$
  select status || '/' || source from availability where user_id = pg_temp.id(u) and option_id = pg_temp.id(o) $$;

-- ga: maya (owner), ann, bob. gb: maya (owner), ann. gc: maya (owner), ann (availability off on its pick).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','ann','bob','outsider']) n;
update profiles p set display_name = n from unnest(array['maya','ann','bob','outsider']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('ga'), 'GA', pg_temp.id('maya'), pg_temp.id('ga')),
  (pg_temp.id('gb'), 'GB', pg_temp.id('maya'), pg_temp.id('gb')),
  (pg_temp.id('gc'), 'GC', pg_temp.id('maya'), pg_temp.id('gc'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('ga'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','ann','bob']) n;
insert into group_members (group_id, user_id, role)
  select g, pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array[pg_temp.id('gb'), pg_temp.id('gc')]) g, unnest(array['maya','ann']) n;
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('venue'), 'Barton Springs swim', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: availability source test');
insert into picks (id, group_id, organizer_id, client_key, deadline, availability_enabled) values
  (pg_temp.id('pa'), pg_temp.id('ga'), pg_temp.id('maya'), pg_temp.id('pa'), now() + interval '1 day', true),
  (pg_temp.id('pb'), pg_temp.id('gb'), pg_temp.id('maya'), pg_temp.id('pb'), now() + interval '1 day', true),
  (pg_temp.id('pc'), pg_temp.id('gc'), pg_temp.id('maya'), pg_temp.id('pc'), now() + interval '1 day', false);
insert into pick_options (id, pick_id, experience_id, position) values
  (pg_temp.id('pa1'), pg_temp.id('pa'), pg_temp.id('venue'), 1),
  (pg_temp.id('pa2'), pg_temp.id('pa'), pg_temp.id('venue'), 2),
  (pg_temp.id('pb1'), pg_temp.id('pb'), pg_temp.id('venue'), 1),
  (pg_temp.id('pc1'), pg_temp.id('pc'), pg_temp.id('venue'), 1);

-- Structure and grants.
select has_function('public', 'set_availability', array['uuid', 'text', 'text'], 'set_availability(option_id, status, source) exists');
select hasnt_function('public', 'set_availability', array['uuid', 'text'], 'The two-argument version is replaced, not kept beside it');
select ok(not has_function_privilege('anon', 'public.set_availability(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_availability(uuid,text,text)', 'EXECUTE'),
  'Only signed-in users run it');

-- A calendar answer without a share is refused, and nothing is written.
set local role authenticated;
select pg_temp.as_user('ann');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'calendar_share_off', 'A calendar answer without a share is refused');
select throws_ok(format($$select public.set_availability(%L, null, 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'calendar_share_off', 'Clearing a calendar answer without a share is refused too');
select is((select count(*) from availability), 0::bigint, 'Nothing was written');
select is(pg_temp.tally('pa1'), '0/0', 'The counts did not move');

-- Other sources and the old two-argument call.
select throws_ok(format($$select public.set_availability(%L, 'free', 'phone')$$, pg_temp.id('pa1')),
  'P0001', 'invalid_source', 'An unknown source is refused');
select throws_ok(format($$select public.set_availability(%L, 'free', null)$$, pg_temp.id('pa1')),
  'P0001', 'invalid_source', 'A null source is refused');
select throws_ok(format($$select public.set_availability(%L, 'free', 'Calendar')$$, pg_temp.id('pa1')),
  'P0001', 'invalid_source', 'Sources are case sensitive');
select lives_ok(format($$select public.set_availability(%L, 'busy')$$, pg_temp.id('pa2')), 'The two-argument call still works');
select is(pg_temp.row_of('ann', 'pa2'), 'busy/manual', 'The two-argument call writes a manual answer');
select lives_ok(format($$select public.set_availability(%L, 'free', 'manual')$$, pg_temp.id('pa2')), 'Saying manual is the same');
select is(pg_temp.row_of('ann', 'pa2'), 'free/manual', 'Still a manual answer');
select lives_ok(format($$select public.set_availability(%L, 'busy', 'manual')$$, pg_temp.id('pa2')), 'Ann sets time 2 busy by hand');

-- With a share, a calendar answer is written and counted.
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')), 'Ann shares her calendar with GA');
select lives_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')), 'Ann writes a calendar answer for time 1');
select is(pg_temp.row_of('ann', 'pa1'), 'free/calendar', 'The row is free, from the calendar');
select is(pg_temp.tally('pa1'), '1/0', 'The tally counts it');
select lives_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')), 'The same calendar answer again is accepted');
select is(pg_temp.tally('pa1'), '1/0', 'The same answer twice changes nothing');
select lives_ok(format($$select public.set_availability(%L, 'busy', 'calendar')$$, pg_temp.id('pa1')), 'The calendar changes its mind');
select is(pg_temp.row_of('ann', 'pa1'), 'busy/calendar', 'The row follows the calendar');
select is(pg_temp.tally('pa1'), '0/1', 'One count moves from free to busy');

-- A calendar answer never overwrites one she gave by hand.
select lives_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa2')), 'A calendar write on a manual answer is accepted');
select is(pg_temp.row_of('ann', 'pa2'), 'busy/manual', 'The manual answer stays');
select is(pg_temp.tally('pa2'), '0/1', 'The counts keep the manual answer');
select lives_ok(format($$select public.set_availability(%L, null, 'calendar')$$, pg_temp.id('pa2')), 'Clearing by calendar on a manual answer is accepted');
select is(pg_temp.row_of('ann', 'pa2'), 'busy/manual', 'The manual answer survives a calendar clear');

-- A manual answer replaces a calendar one and takes over the row.
select lives_ok(format($$select public.set_availability(%L, 'free', 'manual')$$, pg_temp.id('pa1')), 'Ann taps Free over the calendar answer');
select is(pg_temp.row_of('ann', 'pa1'), 'free/manual', 'The row is now manual');
select lives_ok(format($$select public.set_availability(%L, 'busy', 'calendar')$$, pg_temp.id('pa1')), 'A later calendar write is accepted');
select is(pg_temp.row_of('ann', 'pa1'), 'free/manual', 'It does not take the row back');
select is(pg_temp.tally('pa1'), '1/0', 'The counts keep her tap');

-- Clearing by calendar removes only a calendar row.
select lives_ok(format($$select public.set_availability(%L, null)$$, pg_temp.id('pa1')), 'Ann clears time 1 by hand');
select lives_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')), 'The calendar writes time 1 again');
select lives_ok(format($$select public.set_availability(%L, null, 'calendar')$$, pg_temp.id('pa1')), 'The calendar clears it');
select is((select count(*) from availability where option_id = pg_temp.id('pa1')), 0::bigint, 'The calendar row is gone');
select is(pg_temp.tally('pa1'), '0/0', 'The counts follow');

-- A share is per group.
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pb1')),
  'P0001', 'calendar_share_off', 'Sharing with GA does not cover GB');
select pg_temp.as_user('bob');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'calendar_share_off', 'Ann''s share does not cover Bob');

-- The usual refusals still apply to calendar writes.
select pg_temp.as_user('outsider');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')),
  '42501', 'not_a_member', 'A non-member is refused');
select pg_temp.as_user('nobody');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'profile_required', 'A caller with no profile is refused');
select pg_temp.as_user('ann');
select throws_ok(format($$select public.set_availability(%L, 'maybe', 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'invalid_availability', 'Only free or busy are accepted');
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('gc')), 'Ann shares with GC');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pc1')),
  'P0001', 'availability_off', 'A pick with availability off is refused');
reset role;
update picks set deadline = now() - interval '1 minute' where id = pg_temp.id('pa');
set local role authenticated;
select pg_temp.as_user('ann');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'voting_closed', 'A pick past its deadline is refused');
reset role;
update picks set deadline = now() + interval '1 day' where id = pg_temp.id('pa');

-- Turning sharing off removes the calendar answer, keeps the manual one, and writes are refused again.
set local role authenticated;
select pg_temp.as_user('ann');
select lives_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')), 'Ann has a calendar answer on time 1');
select lives_ok(format($$select public.set_calendar_share(%L, false)$$, pg_temp.id('ga')), 'Ann turns sharing off for GA');
select is((select count(*) from availability where option_id = pg_temp.id('pa1')), 0::bigint, 'The calendar answer is gone');
select is(pg_temp.row_of('ann', 'pa2'), 'busy/manual', 'The manual answer stays');
select is(pg_temp.tally('pa1'), '0/0', 'Time 1 counts drop back');
select throws_ok(format($$select public.set_availability(%L, 'free', 'calendar')$$, pg_temp.id('pa1')),
  'P0001', 'calendar_share_off', 'Calendar writes are refused again');
select lives_ok(format($$select public.set_availability(%L, 'free')$$, pg_temp.id('pa1')), 'A manual answer is still fine');

-- Privacy: the share check does not open anyone's rows to others.
select pg_temp.as_user('bob');
select is((select count(*) from availability), 0::bigint, 'Bob reads no one else''s answers');
select is((select count(*) from calendar_shares), 0::bigint, 'Bob reads no one else''s shares');

select * from finish();
rollback;
