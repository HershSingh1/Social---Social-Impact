begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

insert into auth.users (id)
  select pg_temp.id(n) from unnest(array['alice','bob','carol','outsider','nameless']) n;
update profiles set display_name = 'Named user' where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g1'), 'Saturday crew', pg_temp.id('alice'), pg_temp.id('g1')),
  (pg_temp.id('g2'), 'Sunday crew', pg_temp.id('carol'), pg_temp.id('g2'));
insert into group_members (group_id, user_id, role) values
  (pg_temp.id('g1'), pg_temp.id('alice'), 'owner'),
  (pg_temp.id('g1'), pg_temp.id('bob'), 'member'),
  (pg_temp.id('g2'), pg_temp.id('carol'), 'owner');
insert into experiences (id, name, category, price_kind, timing_kind, source, status) values
  (pg_temp.id('exp1'), 'Kayak', 'Outdoors', 'exact', 'flexible', 'PLACEHOLDER: saves test', 'published'),
  (pg_temp.id('removed'), 'Old place', 'Outdoors', 'free', 'unknown', 'PLACEHOLDER: saves test', 'removed');

select has_table('public', 'saves', 'Saves table exists');
select has_function('public', 'toggle_save', array['uuid','uuid'], 'Toggle RPC has the agreed arguments');
select col_is_null('public', 'saves', 'group_id', 'Null group means a personal save');
select ok(has_table_privilege('authenticated', 'public.saves', 'SELECT'), 'Clients can read saves under RLS');
select ok(not has_table_privilege('authenticated', 'public.saves', 'INSERT')
  and not has_table_privilege('authenticated', 'public.saves', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.saves', 'DELETE'), 'Clients cannot mutate saves directly');

set local role authenticated;
select pg_temp.as_user('alice');
select is(public.toggle_save(pg_temp.id('exp1'), null), true, 'Alice adds a personal save');
select is(public.toggle_save(pg_temp.id('exp1'), pg_temp.id('g1')), true, 'Alice saves to her group');
select is((select count(*) from saves), 2::bigint, 'Alice sees her personal and group saves');
select throws_ok(
  $$insert into saves (experience_id, user_id) values (pg_temp.id('exp1'), pg_temp.id('alice'))$$,
  '42501', null, 'Direct client insert is rejected');

select pg_temp.as_user('bob');
select is((select count(*) from saves), 1::bigint, 'Bob sees the group save but never Alice''s personal save');
select is((select count(*) from saves where group_id is null), 0::bigint,
  'A personal save never appears in a group library');
select is(public.toggle_save(pg_temp.id('exp1'), null), true, 'Bob adds his own personal save');
select is(public.toggle_save(pg_temp.id('exp1'), pg_temp.id('g1')), true, 'Bob adds his group save');
select is(public.toggle_save(pg_temp.id('exp1'), pg_temp.id('g1')), false, 'Toggling again removes only Bob''s group save');
select is((select count(*) from saves), 2::bigint, 'Bob still sees his personal save and Alice''s group save');

select pg_temp.as_user('carol');
select is((select count(*) from saves), 0::bigint, 'A different group sees none of these saves');
select throws_ok(
  $$select public.toggle_save(pg_temp.id('exp1'), pg_temp.id('g1'))$$,
  '42501', 'not_a_member', 'A nonmember cannot save into a group');

select pg_temp.as_user('outsider');
select throws_ok(
  $$select public.toggle_save(pg_temp.id('removed'), null)$$,
  'P0001', 'experience_not_found', 'A removed listing cannot be newly saved');
select throws_ok(
  $$select public.toggle_save(pg_temp.id('missing'), null)$$,
  'P0001', 'experience_not_found', 'An unknown listing cannot be saved');

select pg_temp.as_user('nameless');
select throws_ok(
  $$select public.toggle_save(pg_temp.id('exp1'), null)$$,
  'P0001', 'profile_required', 'A completed profile is required');

reset role;
set local role authenticated;
select pg_temp.as_user('bob');
select is(public.toggle_save(pg_temp.id('exp1'), pg_temp.id('g1')), true, 'Bob restores his group save');
reset role;
update group_members set removed_at = now()
  where group_id = pg_temp.id('g1') and user_id = pg_temp.id('bob');
select is((select count(*) from saves where user_id = pg_temp.id('bob') and group_id = pg_temp.id('g1')),
  0::bigint, 'Leaving deletes Bob''s saves from that group');
select is((select count(*) from saves where user_id = pg_temp.id('bob') and group_id is null),
  1::bigint, 'Leaving preserves Bob''s personal saves');
select is((select count(*) from saves where user_id = pg_temp.id('alice') and group_id = pg_temp.id('g1')),
  1::bigint, 'Leaving does not affect another member''s group saves');

select throws_ok(
  $$insert into saves (experience_id, user_id, group_id)
      values (pg_temp.id('exp1'), pg_temp.id('alice'), null)$$,
  '23505', null, 'Null personal scope is unique');
select ok(not has_function_privilege('anon', 'public.toggle_save(uuid,uuid)', 'EXECUTE'),
  'Signed-out clients cannot call toggle_save');

select * from finish();
rollback;
