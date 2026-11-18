-- TEC-136 (P1-02 backend): calendar sharing opt-in per group.
-- Calendar answers are inserted as the server here because set_availability cannot write them yet (see the PR).
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

-- ga: maya (owner), ann, bob, rae. gb: maya (owner), ann.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','ann','bob','rae','outsider']) n;
update profiles p set display_name = n from unnest(array['maya','ann','bob','rae','outsider']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('ga'), 'GA', pg_temp.id('maya'), pg_temp.id('ga')),
  (pg_temp.id('gb'), 'GB', pg_temp.id('maya'), pg_temp.id('gb'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('ga'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','ann','bob','rae']) n;
insert into group_members (group_id, user_id, role)
  select pg_temp.id('gb'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','ann']) n;
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('venue'), 'Barton Springs swim', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: calendar shares test');
insert into picks (id, group_id, organizer_id, client_key, deadline, availability_enabled) values
  (pg_temp.id('pa'), pg_temp.id('ga'), pg_temp.id('maya'), pg_temp.id('pa'), now() + interval '1 day', true),
  (pg_temp.id('pb'), pg_temp.id('gb'), pg_temp.id('maya'), pg_temp.id('pb'), now() + interval '1 day', true);
insert into pick_options (id, pick_id, experience_id, position) values
  (pg_temp.id('pa1'), pg_temp.id('pa'), pg_temp.id('venue'), 1),
  (pg_temp.id('pa2'), pg_temp.id('pa'), pg_temp.id('venue'), 2),
  (pg_temp.id('pb1'), pg_temp.id('pb'), pg_temp.id('venue'), 1);

-- Structure and grants.
select has_table('public', 'calendar_shares', 'calendar_shares exists');
select col_is_pk('public', 'calendar_shares', array['user_id', 'group_id'], 'One share per person per group');
select has_function('public', 'set_calendar_share', array['uuid', 'boolean'], 'set_calendar_share(group_id, enabled) exists');
select has_function('public', 'set_availability', array['uuid', 'text'], 'set_availability keeps its signature');
select ok(not has_table_privilege('authenticated', 'public.calendar_shares', 'INSERT')
  and not has_table_privilege('authenticated', 'public.calendar_shares', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.calendar_shares', 'DELETE'), 'Clients cannot write shares');
select ok(not has_table_privilege('anon', 'public.calendar_shares', 'SELECT'), 'Signed-out callers read no shares');
select ok(not has_function_privilege('anon', 'public.set_calendar_share(uuid,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_calendar_share(uuid,boolean)', 'EXECUTE'),
  'Only signed-in users run set_calendar_share');
select ok(not has_function_privilege('authenticated', 'private.clear_calendar_answers(uuid,uuid)', 'EXECUTE'),
  'The cleanup helper is not callable by clients');

-- Turning sharing on.
set local role authenticated;
select pg_temp.as_user('ann');
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')), 'Ann shares her calendar with GA');
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')), 'Sharing twice is accepted');
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('gb')), 'Ann shares with GB too');
select is((select count(*) from calendar_shares), 2::bigint, 'Ann has one share per group, not three');
select pg_temp.as_user('bob');
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')), 'Bob shares with GA');
select pg_temp.as_user('rae');
select lives_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')), 'Rae shares with GA');

-- Answers: ann and bob by calendar, ann and bob also by hand on the other time.
reset role;
insert into availability (option_id, user_id, status, source) values
  (pg_temp.id('pa1'), pg_temp.id('ann'), 'free', 'calendar'),
  (pg_temp.id('pa1'), pg_temp.id('bob'), 'free', 'calendar'),
  (pg_temp.id('pa1'), pg_temp.id('rae'), 'busy', 'calendar'),
  (pg_temp.id('pa2'), pg_temp.id('ann'), 'busy', 'manual'),
  (pg_temp.id('pa2'), pg_temp.id('bob'), 'free', 'manual'),
  (pg_temp.id('pb1'), pg_temp.id('ann'), 'busy', 'calendar');
select is(pg_temp.tally('pa1'), '2/1', 'Before: time 1 counts 2 free, 1 busy');
select is(pg_temp.tally('pa2'), '1/1', 'Before: time 2 counts 1 free, 1 busy');
select is(pg_temp.tally('pb1'), '0/1', 'Before: GB time counts 1 busy');

-- Privacy.
set local role authenticated;
select pg_temp.as_user('bob');
select is((select count(*) from calendar_shares), 1::bigint, 'Bob sees only his own share');
select is((select count(*) from calendar_shares where user_id = pg_temp.id('ann')), 0::bigint, 'Bob cannot read Ann''s shares');
select pg_temp.as_user('maya');
select is((select count(*) from calendar_shares), 0::bigint, 'Even the owner of the group reads no one else''s shares');
select pg_temp.as_user('outsider');
select is((select count(*) from calendar_shares), 0::bigint, 'An outsider reads no shares');
select pg_temp.as_user('ann');
select throws_ok(format($$insert into calendar_shares (user_id, group_id) values (%L, %L)$$, pg_temp.id('ann'), pg_temp.id('ga')),
  '42501', null, 'A direct insert is refused');
select throws_ok($$update calendar_shares set created_at = now()$$, '42501', null, 'A direct update is refused');
select throws_ok($$delete from calendar_shares$$, '42501', null, 'A direct delete is refused');

-- Refusals.
select pg_temp.as_user('outsider');
select throws_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')),
  '42501', 'not_a_member', 'A non-member cannot share');
select throws_ok(format($$select public.set_calendar_share(%L, false)$$, pg_temp.id('ga')),
  '42501', 'not_a_member', 'A non-member cannot unshare either');
select pg_temp.as_user('bob');
select throws_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('gb')),
  '42501', 'not_a_member', 'Bob is not in GB');
select throws_ok(format($$select public.set_calendar_share(%L, null)$$, pg_temp.id('ga')),
  'P0001', 'invalid_enabled', 'A null choice is refused');
select pg_temp.as_user('nobody');
select throws_ok(format($$select public.set_calendar_share(%L, true)$$, pg_temp.id('ga')),
  'P0001', 'profile_required', 'A caller with no profile is refused');

-- Turning sharing off removes only that person's calendar answers in that group.
select pg_temp.as_user('ann');
select lives_ok(format($$select public.set_calendar_share(%L, false)$$, pg_temp.id('ga')), 'Ann turns sharing off for GA');
select lives_ok(format($$select public.set_calendar_share(%L, false)$$, pg_temp.id('ga')), 'Turning it off twice is accepted');
select is((select count(*) from calendar_shares where group_id = pg_temp.id('ga')), 0::bigint, 'Her GA share is gone');
select is((select count(*) from calendar_shares where group_id = pg_temp.id('gb')), 1::bigint, 'Her GB share stays');
select is((select count(*) from availability where source = 'calendar' and option_id = pg_temp.id('pa1')), 0::bigint,
  'Her calendar answer in GA is gone');
select is((select status from availability where option_id = pg_temp.id('pa2')), 'busy', 'Her manual answer stays');
select is((select count(*) from availability where option_id = pg_temp.id('pb1')), 1::bigint, 'Her calendar answer in GB stays');
reset role;
select is(pg_temp.tally('pa1'), '1/1', 'After: time 1 drops by Ann''s free');
select is(pg_temp.tally('pa2'), '1/1', 'After: time 2 is unchanged');
select is(pg_temp.tally('pb1'), '0/1', 'After: GB is unchanged');
select is((select count(*) from availability where user_id = pg_temp.id('bob') and source = 'calendar'), 1::bigint,
  'Bob''s calendar answer is untouched');

-- Leaving the group clears the share and the calendar answers, not the manual ones.
set local role authenticated;
select pg_temp.as_user('bob');
select lives_ok(format($$select public.leave_group(%L)$$, pg_temp.id('ga')), 'Bob leaves GA');
reset role;
select is((select count(*) from calendar_shares where user_id = pg_temp.id('bob')), 0::bigint, 'Bob''s share left with him');
select is((select count(*) from availability where user_id = pg_temp.id('bob') and source = 'calendar'), 0::bigint,
  'Bob''s calendar answer left with him');
select is((select count(*) from availability where user_id = pg_temp.id('bob') and source = 'manual'), 1::bigint,
  'Leaving does not change his manual answer (existing behavior)');
select is(pg_temp.tally('pa1'), '0/1', 'After Bob leaves: time 1 drops by his free');

-- Being removed does the same.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok(format($$select public.remove_member(%L, %L)$$, pg_temp.id('ga'), pg_temp.id('rae')), 'Maya removes Rae');
reset role;
select is((select count(*) from calendar_shares where user_id = pg_temp.id('rae')), 0::bigint, 'Rae''s share is gone');
select is((select count(*) from availability where user_id = pg_temp.id('rae')), 0::bigint, 'Rae''s calendar answer is gone');
select is(pg_temp.tally('pa1'), '0/0', 'After Rae is removed: time 1 is empty');

-- Allowing someone back does not bring sharing back.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok(format($$select public.allow_back(%L, %L)$$, pg_temp.id('ga'), pg_temp.id('rae')), 'Maya allows Rae back');
reset role;
select is((select count(*) from calendar_shares where user_id = pg_temp.id('rae')), 0::bigint, 'Rae starts with sharing off');

-- Deleting an account removes shares and calendar answers, and the tallies follow.
set local role authenticated;
select pg_temp.as_user('ann');
select lives_ok($$select public.delete_account()$$, 'Ann deletes her account');
reset role;
select is((select count(*) from calendar_shares where user_id = pg_temp.id('ann')), 0::bigint, 'Ann''s shares are gone');
select is((select count(*) from availability where user_id = pg_temp.id('ann')), 0::bigint, 'Ann''s answers are gone');
select is(pg_temp.tally('pb1'), '0/0', 'GB time is empty again');

select * from finish();
rollback;
