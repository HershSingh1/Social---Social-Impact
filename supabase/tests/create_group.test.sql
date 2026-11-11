begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;

insert into auth.users (id) values (pg_temp.id('cg_maya')), (pg_temp.id('cg_raj')), (pg_temp.id('cg_noname'));
update profiles set display_name = 'Maya' where id = pg_temp.id('cg_maya');
update profiles set display_name = 'Raj' where id = pg_temp.id('cg_raj');

select has_function('public', 'create_group', array['uuid', 'text'], 'create_group(client_key, name) exists');
select ok(not has_function_privilege('anon', 'public.create_group(uuid, text)', 'execute'), 'anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.create_group(uuid, text)', 'execute'), 'authenticated can execute');

-- Guards
set local role authenticated;
select throws_ok($$select public.create_group(gen_random_uuid(), 'x')$$, '28000', 'not_authenticated', 'Signed out rejected');
select pg_temp.as_user('cg_maya', true);
select throws_ok($$select public.create_group(gen_random_uuid(), 'x')$$, '28000', 'not_authenticated', 'Anonymous JWT rejected');
select pg_temp.as_user('cg_noname');
select throws_ok($$select public.create_group(gen_random_uuid(), 'x')$$, 'P0001', 'profile_required', 'Profile required');

-- Create
select pg_temp.as_user('cg_maya');
select throws_ok($$select public.create_group(gen_random_uuid(), '   ')$$, 'P0001', 'invalid_group_name', 'Blank name rejected');
select throws_ok($$select public.create_group(gen_random_uuid(), null)$$, 'P0001', 'invalid_group_name', 'Null name rejected');
select throws_ok($$select public.create_group(gen_random_uuid(), repeat('x', 51))$$, 'P0001', 'invalid_group_name', '51 characters rejected');
select throws_ok($$select public.create_group(null, 'x')$$, 'P0001', 'invalid_client_key', 'Null key rejected');
select is((select count(*) from groups), 0::bigint, 'Rejected calls create nothing');
select lives_ok($$select public.create_group(gen_random_uuid(), repeat('x', 50))$$, '50 characters accepted');

reset role;
create temp table r1 (j jsonb);
grant all on r1 to authenticated;
set local role authenticated;
select pg_temp.as_user('cg_raj');
insert into r1 select public.create_group('00000000-0000-0000-0000-0000000000a1', '  Saturday crew  ');
select is((select name from groups where id = (select (j->>'group_id')::uuid from r1)), 'Saturday crew', 'Name trimmed and saved');
select is((select owner_id from groups), pg_temp.id('cg_raj'), 'Creator owns the group');
select is((select count(*) from group_members), 1::bigint, 'Creator is the only member');
select is((select role from group_members), 'owner', 'Member role is owner');
select matches((select j->>'code' from r1), '^[A-HJ-NP-Z2-9]{6}$', 'Code is 6 chars from the allowed alphabet');
select is((select count(*) from join_codes), 1::bigint, 'One code row');
select is((select code from join_codes), (select j->>'code' from r1), 'Returned code is the stored code');
select ok((select (j->>'expires_at')::timestamptz between now() + interval '14 days' - interval '1 minute'
  and now() + interval '14 days' + interval '1 minute' from r1), 'Code valid 14 days');
select is((select (j->>'expires_at')::timestamptz from r1), (select expires_at from join_codes), 'Returned expiry matches stored');

-- Retry
select is(public.create_group('00000000-0000-0000-0000-0000000000a1', 'Different name'), (select j from r1), 'Same key returns the same result');
select is((select count(*) from groups), 1::bigint, 'Retry creates no second group');
select is((select count(*) from join_codes), 1::bigint, 'Retry creates no second code');
select is((select name from groups), 'Saturday crew', 'Retry does not rename');

-- Another user cannot reuse a key or see the group
select pg_temp.as_user('cg_maya');
select throws_ok($$select public.create_group('00000000-0000-0000-0000-0000000000a1', 'Mine')$$, 'P0001', 'client_key_conflict', 'Other user cannot reuse a key');
select is((select count(*) from groups where name = 'Saturday crew'), 0::bigint, 'Maya cannot see Raj group');

-- Clients cannot write or reach helpers
select throws_ok($$insert into join_codes (code, group_id, expires_at) values ('ABCDEF', gen_random_uuid(), now())$$, '42501', null, 'Clients cannot write join_codes');
select throws_ok($$select private.generate_join_code()$$, '42501', null, 'Clients cannot call the code generator');

-- Limit: 20 groups per person (Maya already has 1)
select lives_ok($$select public.create_group(gen_random_uuid(), 'g' || i) from generate_series(2, 20) i$$, 'Up to 20 groups allowed');
select is((select count(*) from group_members where user_id = pg_temp.id('cg_maya')), 20::bigint, 'Maya is in 20 groups');
select throws_ok($$select public.create_group(gen_random_uuid(), 'one too many')$$, 'P0001', 'group_limit_reached', '21st group rejected');
select pg_temp.as_user('cg_raj');
select lives_ok($$select public.create_group(gen_random_uuid(), 'Raj group')$$, 'Limit is per person');

-- Codes: distinct, one active per group
reset role;
select is((select count(distinct code) from join_codes), (select count(*) from join_codes), 'All codes distinct');
select throws_ok($$insert into join_codes (code, group_id, expires_at) select 'ZZZZZZ', group_id, now() from join_codes limit 1$$, '23505', null, 'Second active code for a group rejected');
update join_codes set revoked_at = now() where code = (select j->>'code' from r1);
select lives_ok($$insert into join_codes (code, group_id, expires_at) values ('ZZZZZZ', (select (j->>'group_id')::uuid from r1), now() + interval '14 days')$$, 'New code after revoke allowed');
select * from finish();
rollback;
