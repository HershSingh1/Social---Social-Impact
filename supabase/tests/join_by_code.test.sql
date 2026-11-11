begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

-- Setup (superuser): named users, one group owned by Olive with codes in each state.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['olive','sam','jo','late','tom','ban','rem','many']) n;
update profiles set display_name = 'User ' || substr(id::text, 1, 6);
update profiles set display_name = 'Olive Owner' where id = pg_temp.id('olive');
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g1'), 'Taco Crew', pg_temp.id('olive'), gen_random_uuid()),
  (pg_temp.id('g0'), 'Old Crew', pg_temp.id('olive'), gen_random_uuid());
insert into group_members (group_id, user_id, role) values (pg_temp.id('g1'), pg_temp.id('olive'), 'owner');
-- join_codes_one_active allows one unrevoked code per group, so the expired (not revoked) code
-- lives on its own group and the revoked code is inserted already revoked.
insert into join_codes (code, group_id, expires_at, revoked_at) values
  ('ABC234', pg_temp.id('g1'), now() + interval '14 days', null),
  ('QWE234', pg_temp.id('g0'), now() - interval '1 day', null),
  ('RTY234', pg_temp.id('g1'), now() + interval '14 days', now());

set local role authenticated;
select pg_temp.as_user('sam');
select is(public.preview_group_code(' abc234 '), jsonb_build_object('ok', true, 'group_name', 'Taco Crew',
  'owner_name', 'Olive Owner', 'already_member', false), 'Preview: group and owner name only, case-insensitive, not a member');
select is((select count(*) from group_members), 0::bigint, 'Sam sees no roster before joining');
select is(public.join_group('abc234'), jsonb_build_object('ok', true, 'group_id', pg_temp.id('g1'), 'already_member', false),
  'Join works with a lower-case code');
select is(public.preview_group_code('ABC234') ->> 'already_member', 'true', 'Preview reports already_member');
select is(public.join_group('ABC234') ->> 'already_member', 'true', 'Joining twice returns success');
reset role;
select is((select count(*) from group_members where user_id = pg_temp.id('sam')), 1::bigint, 'No second membership row');
select is((select role from group_members where user_id = pg_temp.id('sam')), 'member', 'Joiner is a member');

-- Errors and the rate limit
set local role authenticated;
select pg_temp.as_user('jo');
select is(public.join_group('ZZZ999') ->> 'error', 'wrong_code', 'Unknown code');
select is(public.join_group('ABC23') ->> 'error', 'wrong_code', 'Malformed code (too short)');
select is(public.join_group(null) ->> 'error', 'wrong_code', 'Null code');
select is(public.preview_group_code('ZZZ999') ->> 'error', 'wrong_code', 'Preview: unknown code');
select is(public.join_group('QWE234') ->> 'error', 'expired', 'Expired code');
reset role;
select is((select attempts from join_attempts where user_id = pg_temp.id('jo')), 5, 'Failed tries persisted (not rolled back)');
set local role authenticated;
select pg_temp.as_user('jo');
select is(public.join_group('ABC234') ->> 'error', 'too_many_tries', 'Sixth try in the minute is refused even with a good code');
select is(public.preview_group_code('ABC234') ->> 'error', 'too_many_tries', 'Preview shares the same limit');
reset role;
select is((select count(*) from group_members where user_id = pg_temp.id('jo')), 0::bigint, 'Throttled user did not join');
update join_attempts set blocked_until = now() - interval '1 second', window_start = now() - interval '61 seconds'
  where user_id = pg_temp.id('jo');
set local role authenticated;
select pg_temp.as_user('jo');
select is(public.join_group('ABC234') ->> 'ok', 'true', 'Allowed again after the minute passes');
reset role;
select is((select attempts from join_attempts where user_id = pg_temp.id('jo')), 0, 'Window reset');

-- Revoked
set local role authenticated;
select pg_temp.as_user('late');
select is(public.join_group('RTY234') ->> 'error', 'expired', 'Revoked code reports expired');
select is(public.preview_group_code('RTY234') ->> 'error', 'expired', 'Preview: revoked code');
reset role;
select is((select attempts from join_attempts where user_id = pg_temp.id('late')), 2, 'Failures counted');

-- Blocked, and someone who left
insert into group_members (group_id, user_id, blocked, removed_at) values (pg_temp.id('g1'), pg_temp.id('ban'), true, now());
insert into group_members (group_id, user_id, removed_at) values (pg_temp.id('g1'), pg_temp.id('rem'), now());
set local role authenticated;
select pg_temp.as_user('ban');
select is(public.join_group('ABC234') ->> 'error', 'blocked', 'Blocked user cannot join');
select pg_temp.as_user('rem');
select is(public.join_group('ABC234') ->> 'ok', 'true', 'Someone who left can rejoin');
reset role;
select is((select removed_at from group_members where user_id = pg_temp.id('rem')), null, 'Rejoin clears removed_at');
select is((select count(*) from group_members where user_id = pg_temp.id('rem')), 1::bigint, 'Rejoin reuses the row');

-- Group full: 30 active members (blocked and removed rows do not count)
insert into auth.users (id) select pg_temp.id('f' || n) from generate_series(1, 26) n;
insert into group_members (group_id, user_id)
  select pg_temp.id('g1'), pg_temp.id('f' || n) from generate_series(1, 26) n; -- olive, sam, jo, rem + 26 = 30
set local role authenticated;
select pg_temp.as_user('tom');
select is(public.join_group('ABC234') ->> 'error', 'group_full', 'Group at 30 members is full');
reset role;
select is((select count(*) from group_members where group_id = pg_temp.id('g1') and removed_at is null and not blocked),
  30::bigint, 'Still 30 members');
delete from group_members where user_id = pg_temp.id('f1');
set local role authenticated;
select pg_temp.as_user('tom');
select is(public.join_group('ABC234') ->> 'ok', 'true', 'A freed seat can be taken');

-- Too many groups (20)
reset role;
insert into groups (id, name, owner_id, client_key)
  select pg_temp.id('x' || n), 'G' || n, pg_temp.id('olive'), gen_random_uuid() from generate_series(1, 20) n;
insert into group_members (group_id, user_id) select pg_temp.id('x' || n), pg_temp.id('many') from generate_series(1, 20) n;
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g2'), 'Second', pg_temp.id('olive'), gen_random_uuid());
insert into join_codes (code, group_id, expires_at) values ('XYZ789', pg_temp.id('g2'), now() + interval '1 day');
set local role authenticated;
select pg_temp.as_user('many');
select is(public.join_group('XYZ789') ->> 'error', 'too_many_groups', 'Member of 20 groups cannot join a 21st');

-- Security
reset role;
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  and p.proname in ('preview_group_code', 'join_group') and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0::bigint, 'anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.join_group(text)', 'EXECUTE'), 'authenticated can join_group');
select ok(has_function_privilege('authenticated', 'public.preview_group_code(text)', 'EXECUTE'), 'authenticated can preview');
select ok(not has_function_privilege('authenticated', 'private.check_join_code(uuid,text)', 'EXECUTE'), 'Helper is not callable');
select ok(not exists (select 1 from information_schema.columns where table_name = 'join_attempts' and column_name like '%code%'),
  'join_attempts stores no codes');
insert into auth.users (id) values (pg_temp.id('nameless'));
set local role authenticated;
select pg_temp.as_user('nameless');
select throws_ok($$select public.join_group('ABC234')$$, 'P0001', 'profile_required', 'join_group needs a profile name');
select throws_ok($$select public.preview_group_code('ABC234')$$, 'P0001', 'profile_required', 'preview needs a profile name');
select set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.join_group('ABC234')$$, '28000', 'not_authenticated', 'Signed-out is rejected');
reset role;
select * from finish();
rollback;
