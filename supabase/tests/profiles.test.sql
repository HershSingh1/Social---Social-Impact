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

-- City and age (TEC-108, PRO-9 F1): optional, own-row only, never shared
select has_function('public', 'set_profile', array['text', 'text', 'text', 'integer'], 'set_profile takes city and age');
select hasnt_function('public', 'set_profile', array['text', 'text'], 'Old two-argument set_profile is gone');
set local role authenticated;
select pg_temp.as_user('newbie');
select lives_ok($$select public.set_profile('Newbie', null, '  Austin, TX  ', 20)$$, 'City and age saved');
select is((select city from profiles), 'Austin, TX', 'City is trimmed');
select is((select age from profiles), 20::smallint, 'Age is stored');
select lives_ok($$select public.set_profile('Newbie')$$, 'Omitting city and age is allowed');
select is((select city from profiles), null, 'Omitted city is cleared');
select is((select age from profiles), null, 'Omitted age is cleared');
select lives_ok($$select public.set_profile('Newbie', null, '   ', null)$$, 'Blank city is allowed');
select is((select city from profiles), null, 'Blank city is stored as null');
select lives_ok($$select public.set_profile('Newbie', null, repeat('c', 60), null)$$, '60-character city accepted');
select throws_ok($$select public.set_profile('Newbie', null, repeat('c', 61), null)$$, 'P0001', 'invalid_city', '61-character city rejected');
select lives_ok($$select public.set_profile('Newbie', null, null, 13)$$, 'Age 13 accepted');
select lives_ok($$select public.set_profile('Newbie', null, null, 120)$$, 'Age 120 accepted');
select throws_ok($$select public.set_profile('Newbie', null, null, 12)$$, 'P0001', 'invalid_age', 'Age 12 rejected');
select throws_ok($$select public.set_profile('Newbie', null, null, 121)$$, 'P0001', 'invalid_age', 'Age 121 rejected');
select throws_ok($$select public.set_profile('Newbie', null, null, 0)$$, 'P0001', 'invalid_age', 'Age 0 rejected');
select throws_ok($$select public.set_profile('Newbie', null, null, -5)$$, 'P0001', 'invalid_age', 'Negative age rejected');
select lives_ok($$select public.set_profile('Newbie', null, 'Dallas', 30)$$, 'Valid city and age saved again');
select throws_ok($$select public.set_profile('Changed', null, 'Houston', 12)$$, 'P0001', 'invalid_age', 'Rejected call fails');
select is((select display_name || '/' || city || '/' || age from profiles), 'Newbie/Dallas/30', 'A rejected call changes nothing');

reset role;
set local role authenticated;
select pg_temp.as_user('other');
select is((select count(*) from profiles where id = pg_temp.id('newbie')), 0::bigint, 'Other users cannot read city or age');
reset role;
select is(pg_get_function_result('public.get_profile_cards(uuid[])'::regprocedure),
  'TABLE(user_id uuid, display_name text, avatar_path text)', 'get_profile_cards does not return city or age');
select ok(not has_function_privilege('anon', 'public.set_profile(text, text, text, integer)', 'EXECUTE'), 'Signed-out cannot execute the new set_profile');

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
