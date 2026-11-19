-- TEC-129 (P1-01 backend): Free or Busy per time option, counts only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.opts(n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('experience_id', pg_temp.id('venue'),
    'proposed_start', (now() + make_interval(days => i))::text)) from generate_series(1, n) i $$;

-- g: maya (owner), ann, bob, cy, rae (removed later). g2: maya, ann, bob (same votes as g for the winner check).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','ann','bob','cy','rae','outsider']) n;
update profiles p set display_name = n from unnest(array['maya','ann','bob','cy','rae','outsider']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('g')),
  (pg_temp.id('g2'), 'G2', pg_temp.id('maya'), pg_temp.id('g2')),
  (pg_temp.id('g3'), 'G3', pg_temp.id('maya'), pg_temp.id('g3'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('g'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','ann','bob','cy','rae']) n;
insert into group_members (group_id, user_id, role)
  select pg_temp.id('g2'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','ann','bob']) n;
insert into group_members (group_id, user_id, role) values (pg_temp.id('g3'), pg_temp.id('maya'), 'owner');
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('venue'), 'Barton Springs swim', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: availability test');

-- Structure and grants.
select has_table('public', 'availability', 'availability exists');
select has_table('public', 'availability_tallies', 'availability_tallies exists');
select has_column('public', 'picks', 'availability_enabled', 'picks has availability_enabled');
select col_default_is('public', 'picks', 'availability_enabled', 'false', 'Availability is off by default');
select col_default_is('public', 'availability', 'source', 'manual','Source defaults to manual');
select has_function('public', 'set_availability', array['uuid','text','text'], 'set_availability(option_id, status, source) exists');
select has_function('public', 'create_pick', array['uuid','jsonb','timestamp with time zone','integer','uuid','boolean'],
  'create_pick takes availability as its last parameter');
select ok(not has_table_privilege('authenticated', 'public.availability', 'INSERT')
  and not has_table_privilege('authenticated', 'public.availability', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.availability', 'DELETE'), 'Clients cannot write availability');
select ok(not has_table_privilege('authenticated', 'public.availability_tallies', 'INSERT')
  and not has_table_privilege('authenticated', 'public.availability_tallies', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.availability_tallies', 'DELETE'), 'Clients cannot write tallies');
select ok(not has_table_privilege('anon', 'public.availability', 'SELECT')
  and not has_table_privilege('anon', 'public.availability_tallies', 'SELECT'), 'Signed-out callers read nothing');
select ok(not has_function_privilege('anon', 'public.set_availability(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_availability(uuid,text,text)', 'EXECUTE'), 'Only signed-in users run set_availability');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename = 'availability_tallies'), 'Tallies are in the Realtime publication');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename = 'availability'), 'The private rows are not published');

-- create_pick: with the new parameter, and without it (as before).
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day', null, %L, true)$$,
  pg_temp.id('g'), pg_temp.opts(3), pg_temp.id('ck_on')), 'Organizer creates a pick with availability on');
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day', 2, %L)$$,
  pg_temp.id('g2'), pg_temp.opts(2), pg_temp.id('ck_plain')), 'create_pick without the new parameter still works');
select lives_ok(format($$select public.create_pick(%L, %L, now() + interval '1 day', null, %L, null)$$,
  pg_temp.id('g3'), pg_temp.opts(2), pg_temp.id('ck_null')), 'A null availability counts as off');
reset role;
create temp table pk_on as select id from picks where client_key = pg_temp.id('ck_on');
create temp table pk_plain as select id from picks where client_key = pg_temp.id('ck_plain');
create temp table opt_on as select o.id, o.position from pick_options o where o.pick_id = (select id from pk_on);
create temp table opt_plain as select o.id, o.position from pick_options o where o.pick_id = (select id from pk_plain);
grant select on pk_on, pk_plain, opt_on, opt_plain to authenticated;
select is((select availability_enabled from picks where id = (select id from pk_on)), true, 'The pick records availability on');
select is((select availability_enabled from picks where id = (select id from pk_plain)), false, 'Omitting the parameter leaves it off');
select is((select availability_enabled from picks where client_key = pg_temp.id('ck_null')), false, 'Null leaves it off');
select is((select count(*) from pick_options where pick_id = (select id from pk_plain)), 2::bigint, 'Options are stored as before');
select is((select starred_option_id from picks where id = (select id from pk_plain)),
  (select id from opt_plain where position = 2), 'The star is stored as before');
select is((select count(*) from pick_voter_status where pick_id = (select id from pk_plain)), 3::bigint, 'Voter rows are made as before');
select is((select count(*) from availability_tallies t join opt_on o on o.id = t.option_id where t.free = 0 and t.busy = 0),
  3::bigint, 'Every option starts with a 0 free, 0 busy tally');
select is((select count(*) from availability), 0::bigint, 'No answers exist yet');

-- Answers and counts.
set local role authenticated;
select pg_temp.as_user('ann');
select lives_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_on where position = 1)), 'Ann marks time 1 free');
select pg_temp.as_user('bob');
select lives_ok(format($$select public.set_availability(%L, 'busy')$$, (select id from opt_on where position = 1)), 'Bob marks time 1 busy');
select pg_temp.as_user('cy');
select lives_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_on where position = 1)), 'Cy marks time 1 free');
select lives_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_on where position = 2)), 'Cy marks time 2 free');
select results_eq(format($$select free::int, busy::int from availability_tallies where option_id = %L$$, (select id from opt_on where position = 1)),
  $$values (2, 1)$$, 'Time 1 counts 2 free, 1 busy after three inserts');
select results_eq(format($$select free::int, busy::int from availability_tallies where option_id = %L$$, (select id from opt_on where position = 2)),
  $$values (1, 0)$$, 'Time 2 counts 1 free');
select lives_ok(format($$select public.set_availability(%L, 'busy')$$, (select id from opt_on where position = 1)), 'Cy changes time 1 to busy');
select results_eq(format($$select free::int, busy::int from availability_tallies where option_id = %L$$, (select id from opt_on where position = 1)),
  $$values (1, 2)$$, 'A change moves one count from free to busy');
select lives_ok(format($$select public.set_availability(%L, 'busy')$$, (select id from opt_on where position = 1)), 'Sending the same answer again is accepted');
select results_eq(format($$select free::int, busy::int from availability_tallies where option_id = %L$$, (select id from opt_on where position = 1)),
  $$values (1, 2)$$, 'The same answer twice changes nothing');
select lives_ok(format($$select public.set_availability(%L, null)$$, (select id from opt_on where position = 1)), 'Cy clears time 1');
select results_eq(format($$select free::int, busy::int from availability_tallies where option_id = %L$$, (select id from opt_on where position = 1)),
  $$values (1, 1)$$, 'Clearing removes the count');
select lives_ok(format($$select public.set_availability(%L, null)$$, (select id from opt_on where position = 1)), 'Clearing twice is accepted');
select results_eq(format($$select free::int, busy::int from availability_tallies where option_id = %L$$, (select id from opt_on where position = 1)),
  $$values (1, 1)$$, 'Clearing twice leaves the counts alone');
select is((select source from availability where user_id = pg_temp.id('cy') limit 1), 'manual', 'Answers made here are manual');

-- Privacy: counts for members, rows only for their owner.
select is((select count(*) from availability), 1::bigint, 'Cy sees only their own remaining row');
select is((select count(*) from availability where user_id <> pg_temp.id('cy')), 0::bigint, 'Cy cannot read anyone else''s row');
select pg_temp.as_user('ann');
select is((select count(*) from availability), 1::bigint, 'Ann sees only her own row, not Bob''s busy');
select is((select status from availability), 'free', 'Ann''s own row says free');
select is((select count(*) from availability_tallies t join opt_on o on o.id = t.option_id), 3::bigint, 'Ann reads the counts for every time');
select pg_temp.as_user('outsider');
select is((select count(*) from availability), 0::bigint, 'An outsider reads no availability');
select is((select count(*) from availability_tallies), 0::bigint, 'An outsider reads no counts');
select pg_temp.as_user('ann');
select throws_ok(format($$insert into availability (option_id, user_id, status) values (%L, %L, 'free')$$,
  (select id from opt_on where position = 3), pg_temp.id('ann')), '42501', null, 'A direct insert is refused');
select throws_ok($$update availability set status = 'busy'$$, '42501', null, 'A direct update is refused');
select throws_ok($$delete from availability$$, '42501', null, 'A direct delete is refused');
select throws_ok($$update availability_tallies set free = 99$$, '42501', null, 'A direct tally edit is refused');

-- Refusals.
select pg_temp.as_user('outsider');
select throws_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_on where position = 1)),
  '42501', 'not_a_member', 'A non-member is refused');
select pg_temp.as_user('ann');
select throws_ok(format($$select public.set_availability(%L, 'maybe')$$, (select id from opt_on where position = 1)),
  'P0001', 'invalid_availability', 'Only free or busy are accepted');
select throws_ok($$select public.set_availability(pg_temp.id('nothing'), 'free')$$,
  'P0001', 'option_not_found', 'An unknown option is refused');
select throws_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_plain where position = 1)),
  'P0001', 'availability_off', 'A pick with availability off is refused');
select pg_temp.as_user('nobody');
select throws_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_on where position = 1)),
  'P0001', 'profile_required', 'A caller with no profile is refused');
reset role;
update group_members set removed_at = now() where group_id = pg_temp.id('g') and user_id = pg_temp.id('rae');
set local role authenticated;
select pg_temp.as_user('rae');
select throws_ok(format($$select public.set_availability(%L, 'free')$$, (select id from opt_on where position = 1)),
  '42501', 'not_a_member', 'A removed member is refused');
select is((select count(*) from availability_tallies), 0::bigint, 'A removed member reads no counts');

-- Past the deadline, then closed.
reset role;
update picks set deadline = now() - interval '1 minute' where id = (select id from pk_on);
set local role authenticated;
select pg_temp.as_user('ann');
select throws_ok(format($$select public.set_availability(%L, 'busy')$$, (select id from opt_on where position = 1)),
  'P0001', 'voting_closed', 'A pick past its deadline is refused');
reset role;
update picks set deadline = now() + interval '1 day' where id = (select id from pk_on);
select private.close_pick_now((select id from pk_on));
set local role authenticated;
select pg_temp.as_user('ann');
select throws_ok(format($$select public.set_availability(%L, 'busy')$$, (select id from opt_on where position = 1)),
  'P0001', 'voting_closed', 'A closed pick is refused');
select throws_ok(format($$select public.set_availability(%L, null)$$, (select id from opt_on where position = 1)),
  'P0001', 'voting_closed', 'A closed pick cannot be cleared either');
select is((select free::int from availability_tallies where option_id = (select id from opt_on where position = 1)), 1,
  'Refused calls left the counts alone');

-- close_pick and the tie-breaker ignore availability. Two picks with the same votes and options, one with heavy
-- availability on the losing time: the winner and the stated reason are identical.
reset role;
-- g2 and g3 already have an open pick from above; cancel them so the comparison picks can be the open ones.
update picks set state = 'cancelled' where id = (select id from pk_plain);
update picks set state = 'cancelled' where client_key = pg_temp.id('ck_null');
create temp table cmp as select * from (values ('x'), ('y')) v(p);
insert into picks (id, group_id, organizer_id, client_key, deadline, created_at, availability_enabled)
  select pg_temp.id('cmp_' || p), pg_temp.id(case p when 'x' then 'g2' else 'g3' end), pg_temp.id('maya'), pg_temp.id('cmp_' || p),
    now() + interval '1 day', now() - interval '2 hours', p = 'x' from cmp;
insert into pick_options (id, pick_id, experience_id, position)
  select pg_temp.id('cmp_' || p || i), pg_temp.id('cmp_' || p), pg_temp.id('venue'), i from cmp, generate_series(1, 2) i;
-- Same votes on both: maya says yes to both times, so points tie and the earlier option wins.
insert into votes (option_id, user_id, value)
  select pg_temp.id('cmp_' || p || i), pg_temp.id('maya'), 'yes' from cmp, generate_series(1, 2) i;
-- Pick x only: everyone is busy for time 1 and free for time 2.
insert into availability (option_id, user_id, status)
  select pg_temp.id('cmp_x1'), pg_temp.id(n), 'busy' from unnest(array['maya','ann','bob']) n;
insert into availability (option_id, user_id, status)
  select pg_temp.id('cmp_x2'), pg_temp.id(n), 'free' from unnest(array['maya','ann','bob']) n;
select is((select free::int || '/' || busy::int from availability_tallies where option_id = pg_temp.id('cmp_x1')), '0/3',
  'Rows inserted on the server are counted too');
select private.close_pick_now(pg_temp.id('cmp_x'));
select private.close_pick_now(pg_temp.id('cmp_y'));
select is((select o.position from picks p join pick_options o on o.id = p.winner_option_id where p.id = pg_temp.id('cmp_x')),
  (select o.position from picks p join pick_options o on o.id = p.winner_option_id where p.id = pg_temp.id('cmp_y')),
  'close_pick chooses the same winner with and without availability rows');
select is((select position from pick_options where id = (select winner_option_id from picks where id = pg_temp.id('cmp_x'))), 1,
  'The winner is still decided by votes and the tie rule (added first)');
select is((select tie_rule from picks where id = pg_temp.id('cmp_x')), (select tie_rule from picks where id = pg_temp.id('cmp_y')),
  'The stated reason is the same too');

-- Deleting an account removes that person's answers from the counts.
select is((select free::int from availability_tallies where option_id = (select id from opt_on where position = 2)), 1,
  'Before deleting: Cy is the one free count on time 2');
set local role authenticated;
select pg_temp.as_user('cy');
select lives_ok($$select public.delete_account()$$, 'Cy deletes their account');
reset role;
select is((select count(*) from availability where user_id = pg_temp.id('cy')), 0::bigint, 'Their answers are gone');
select is((select free::int from availability_tallies where option_id = (select id from opt_on where position = 2)), 0,
  'The counts no longer include them');

select * from finish();
rollback;
