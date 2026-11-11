begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(u), 'role', 'authenticated',
    'is_anonymous', anon)::text, true);
  set local role authenticated;
end $$;

-- Trigger: signing up creates a profile with no name.
insert into auth.users (id) values (pg_temp.id('newbie')), (pg_temp.id('anon'));
select is((select display_name from profiles where id = pg_temp.id('newbie')), null, 'sign-up creates a profile with a null name');
select hasnt_column('public', 'profiles', 'is_guest', 'no is_guest column (D1)');

-- require_profile gate
select pg_temp.as_user('newbie');
select throws_ok('select public.require_profile()', 'P0001', 'profile_required', 'unnamed profile raises profile_required');

-- set_profile validation
select throws_ok($$select public.set_profile('   ')$$, '22023', 'invalid_display_name', 'blank name rejected');
select throws_ok($$select public.set_profile(null)$$, '22023', 'invalid_display_name', 'null name rejected');
select throws_ok($$select public.set_profile(repeat('x', 61))$$, '22023', 'invalid_display_name', '61 chars rejected');
select is((select display_name from public.profiles), null, 'failed set_profile leaves the name null');
select lives_ok($$select public.set_profile('  Maya  ', 'avatars/maya.png')$$, 'valid name accepted');
select is((select display_name from public.profiles), 'Maya', 'name is trimmed');
select is((select avatar_path from public.profiles), 'avatars/maya.png', 'avatar saved');
select lives_ok($$select public.set_profile(repeat('y', 60))$$, '60 chars accepted');
select is((select avatar_path from public.profiles), 'avatars/maya.png', 'omitted avatar keeps the old one');
select is(public.require_profile(), pg_temp.id('newbie'), 'named profile passes and returns its id');

-- Clients cannot write profiles directly or change another profile.
select throws_ok($$update public.profiles set display_name = 'Hax'$$, '42501', null, 'direct table write denied');
reset role;
select pg_temp.as_user('anon');
select public.set_profile('Other');
reset role;
select is((select display_name from public.profiles where id = pg_temp.id('newbie')), repeat('y', 60), 'set_profile only touches the caller');
reset role;

-- Anonymous JWT (even with a name) cannot call any RPC.
update profiles set display_name = 'Ghost' where id = pg_temp.id('anon');
select pg_temp.as_user('anon', true);
select throws_ok('select public.require_profile()', '42501', 'anonymous_not_allowed', 'anonymous JWT blocked by require_profile');
select throws_ok($$select public.set_profile('Anon')$$, '42501', 'anonymous_not_allowed', 'anonymous JWT blocked by set_profile');
reset role;

-- Signed-out (anon role) cannot execute the RPCs at all.
set local role anon;
select throws_ok('select public.require_profile()', '42501', null, 'anon role cannot call require_profile');
select throws_ok($$select public.set_profile('x')$$, '42501', null, 'anon role cannot call set_profile');
reset role;

-- Every public function that is executable by authenticated is on an allow list reviewed here;
-- when a new write RPC is added it must call require_profile() and be added to this list.
select is((select array_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), null, 'no public function is callable by anon');
select * from finish();
rollback;
