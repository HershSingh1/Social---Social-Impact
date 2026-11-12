begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan','nameless']) n;
update profiles set display_name = initcap(id::text) where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n) from unnest(array['maya','jordan']) n;

select has_function('public', 'set_profile_defaults', array['numeric','text'], 'set_profile_defaults exists');
select ok(not has_function_privilege('anon', 'public.set_profile_defaults(numeric,text)', 'EXECUTE'), 'Signed-out clients cannot call it');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'Clients cannot write profiles directly');

set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select set_profile_defaults(35.5, 'transit')$$, 'Maya sets a budget and how she gets around');
select is((select budget_cap from profiles where id = pg_temp.id('maya')), 35.5::numeric, 'She reads her own budget back');
select is((select transport from profiles where id = pg_temp.id('maya')), 'transit', 'She reads her own transport back');

-- Private to the person
select pg_temp.as_user('jordan');
select is((select count(*) from profiles where id = pg_temp.id('maya')), 0::bigint, 'Jordan, in the same group, cannot read Maya''s profile row');
select is((select count(*) from profiles where budget_cap is not null or transport is not null), 0::bigint, 'No one else''s budget or transport is visible');
select is((select count(*) from get_profile_cards(array[pg_temp.id('maya')])), 1::bigint, 'Jordan can still get Maya''s name and photo');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'get_profile_cards'), 'No view of profile columns is exposed');
select ok(not ((to_jsonb((select c from get_profile_cards(array[pg_temp.id('maya')]) c)) ? 'budget_cap') or (to_jsonb((select c from get_profile_cards(array[pg_temp.id('maya')]) c)) ? 'transport')),
  'The profile card carries no budget or transport');

-- Not copied into plans
reset role;
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name in ('plans', 'plan_revisions', 'rsvps', 'picks', 'groups', 'group_members')
  and column_name in ('budget_cap', 'transport', 'budget')), 'No plan, pick or group table has a budget or transport column');

-- Validation
set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select set_profile_defaults(-1, null)$$, 'P0001', 'invalid_budget', 'A negative budget is refused');
select throws_ok($$select set_profile_defaults(1000.01, null)$$, 'P0001', 'invalid_budget', 'A budget over 1,000 is refused');
select throws_ok($$select set_profile_defaults(20, 'teleport')$$, 'P0001', 'invalid_transport', 'An unknown way of getting around is refused');
select is((select budget_cap from profiles where id = pg_temp.id('maya')), 35.5::numeric, 'A refused call changes nothing');
select lives_ok($$select set_profile_defaults(0, 'need_a_ride')$$, 'Zero is a valid budget, and Need a ride a valid choice');
select is((select budget_cap from profiles where id = pg_temp.id('maya')), 0::numeric, 'Zero is kept, not cleared');
select lives_ok($$select set_profile_defaults(12.345, 'walk')$$, 'A budget with extra decimals is accepted');
select is((select budget_cap from profiles where id = pg_temp.id('maya')), 12.35::numeric, 'It is stored to the cent');
select lives_ok($$select set_profile_defaults(null, null)$$, 'Clearing both is allowed');
select is((select budget_cap is null and transport is null from profiles where id = pg_temp.id('maya')), true, 'Both are cleared');

-- Changing the name keeps the defaults
select lives_ok($$select set_profile_defaults(40, 'bike')$$, 'Set again');
select lives_ok($$select set_profile('Maya R', null, 'Austin', 30)$$, 'Maya changes her name');
select is((select budget_cap || '/' || transport from profiles where id = pg_temp.id('maya')), '40.00/bike', 'Her defaults survive a profile edit');

-- Guard
select pg_temp.as_user('nameless');
select throws_ok($$select set_profile_defaults(20, 'walk')$$, 'P0001', 'profile_required', 'A finished profile is required');

select * from finish();
rollback;
