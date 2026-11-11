begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;

-- Sign-up trigger
insert into auth.users (id) values (pg_temp.id('newbie'));
select is((select display_name from profiles where id = pg_temp.id('newbie')), null, 'Sign-up creates a profile with no name');
select hasnt_column('public', 'profiles', 'is_guest', 'No is_guest column (D1)');

-- A write RPC built on the guard (stand-in for the feature RPCs)
create function public.test_write() returns uuid language plpgsql security definer set search_path = '' as
  $$ begin return public.require_profile(); end $$;
revoke all on function public.test_write() from public, anon;
grant execute on function public.test_write() to authenticated;

set local role authenticated;
select pg_temp.as_user('newbie');
select throws_ok('select public.test_write()', 'P0001', 'profile_required', 'Write blocked until name is set');
select throws_ok($$select public.set_profile('   ')$$, 'P0001', 'invalid_display_name', 'Blank name rejected');
select throws_ok($$select public.set_profile(null)$$, 'P0001', 'invalid_display_name', 'Null name rejected');
select throws_ok($$select public.set_profile(repeat('x', 61))$$, 'P0001', 'invalid_display_name', '61 characters rejected');
select throws_ok('select public.test_write()', 'P0001', 'profile_required', 'Rejected names leave profile unset');
select lives_ok($$select public.set_profile(repeat('x', 60))$$, '60 characters accepted');
select lives_ok($$select public.set_profile('  Newbie  ', 'avatars/me.png')$$, 'Name trimmed and avatar saved');
select is((select display_name from profiles), 'Newbie', 'Stored name is trimmed');
select is((select avatar_path from profiles), 'avatars/me.png', 'Avatar path stored');
select is(public.test_write(), pg_temp.id('newbie'), 'Writes allowed once named');
select lives_ok($$select public.set_profile('Newbie 2')$$, 'Name can be changed');
select is((select avatar_path from profiles), null, 'Omitted avatar clears it');
select throws_ok('select public.require_profile()', '42501', null, 'Clients cannot call require_profile directly');

-- Another user only ever changes their own profile
reset role;
insert into auth.users (id) values (pg_temp.id('other'));
set local role authenticated;
select pg_temp.as_user('other');
select lives_ok($$select public.set_profile('Other')$$, 'Other user sets own name');
select is((select count(*) from profiles), 1::bigint, 'RLS hides the first profile from other');
reset role;
select is((select display_name from profiles where id = pg_temp.id('newbie')), 'Newbie 2', 'First profile unchanged by other');

-- Anonymous sign-ins are off in config.toml; anonymous JWTs and signed-out clients can call no RPC
set local role authenticated;
select pg_temp.as_user('newbie', true);
select throws_ok($$select public.set_profile('Anon')$$, '28000', 'not_authenticated', 'Anonymous JWT cannot set_profile');
select throws_ok('select public.test_write()', '28000', 'not_authenticated', 'Anonymous JWT blocked by require_profile');
reset role;
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'Signed-out (anon role) can execute no public function');
set local role anon;
select throws_ok($$select public.set_profile('Anon')$$, '42501', null, 'Signed-out cannot call set_profile');
reset role;
select * from finish();
rollback;
