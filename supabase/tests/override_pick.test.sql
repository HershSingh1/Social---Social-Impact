begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan','nameless']) n;
update profiles set display_name = id::text where id in (pg_temp.id('maya'), pg_temp.id('jordan'));
insert into groups (id, name, owner_id, client_key)
  values (pg_temp.id('g'), 'Crew', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id, role) values
  (pg_temp.id('g'), pg_temp.id('maya'), 'owner'),
  (pg_temp.id('g'), pg_temp.id('jordan'), 'member');
insert into experiences (id, name, category, price_kind, timing_kind, source) values
  (pg_temp.id('winner'), 'Sketch and stroll', 'Arts', 'free', 'flexible', 'PLACEHOLDER: test'),
  (pg_temp.id('other'), 'Clay and conversation', 'Arts', 'exact', 'flexible', 'PLACEHOLDER: test'),
  (pg_temp.id('third'), 'Barton Springs swim', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: test');
insert into picks (id, group_id, organizer_id, client_key, deadline, state, winner_option_id, closed_at)
  values (pg_temp.id('closed'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('ck'), now() + interval '1 day', 'closed', null, now()),
         (pg_temp.id('open'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('ok'), now() + interval '1 day', 'open', null, null);
insert into pick_options (id, pick_id, experience_id, position) values
  (pg_temp.id('w'), pg_temp.id('closed'), pg_temp.id('winner'), 1),
  (pg_temp.id('o'), pg_temp.id('closed'), pg_temp.id('other'), 2),
  (pg_temp.id('t'), pg_temp.id('closed'), pg_temp.id('third'), 3),
  (pg_temp.id('ow'), pg_temp.id('open'), pg_temp.id('winner'), 1),
  (pg_temp.id('oo'), pg_temp.id('open'), pg_temp.id('other'), 2);
update picks set winner_option_id = pg_temp.id('w') where id = pg_temp.id('closed');

set local role authenticated;
select pg_temp.as_user('jordan');
select throws_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('o'))$$,
  '42501', 'not_organizer', 'Only the organizer can override');
select pg_temp.as_user('maya');
select throws_ok($$select public.override_pick(pg_temp.id('open'), pg_temp.id('oo'))$$,
  'P0001', 'pick_not_closed', 'An open pick cannot be overridden');
select throws_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('oo'))$$,
  'P0001', 'option_not_found', 'The option must belong to the pick');
select lives_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('o'))$$,
  'Organizer chooses another option');
select is((select override_option_id from public.picks where id = pg_temp.id('closed')),
  pg_temp.id('o'), 'The override is stored for every member to read');
select lives_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('o'))$$,
  'Repeating the same override is idempotent');
select lives_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('t'))$$,
  'The organizer can change the choice before making the plan');
select is((select override_option_id from public.picks where id = pg_temp.id('closed')),
  pg_temp.id('t'), 'The latest organizer choice is stored');
select lives_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('w'))$$,
  'Choosing the winner goes back to the vote result');
select is((select override_option_id from public.picks where id = pg_temp.id('closed')),
  null, 'Choosing the winner clears the override');
select public.override_pick(pg_temp.id('closed'), pg_temp.id('o'));
select pg_temp.as_user('jordan');
select is((select override_option_id from public.picks where id = pg_temp.id('closed')),
  pg_temp.id('o'), 'Other members can read the override');
select pg_temp.as_user('maya');

reset role;
insert into picks (id, group_id, organizer_id, client_key, deadline, state, closed_at)
  values (pg_temp.id('empty'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('ek'), now() + interval '1 day', 'closed', now());
insert into pick_options (id, pick_id, experience_id, position)
  values (pg_temp.id('empty1'), pg_temp.id('empty'), pg_temp.id('winner'), 1);
set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select public.override_pick(pg_temp.id('empty'), pg_temp.id('empty1'))$$,
  'P0001', 'no_winner', 'Nobody-voted picks use the existing choose-an-option path');
select pg_temp.as_user('nameless');
select throws_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('o'))$$,
  'P0001', 'profile_required', 'A display name is required');
select pg_temp.as_user('maya');
reset role;
update picks set state = 'planned' where id = pg_temp.id('closed');
set local role authenticated;
select throws_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('t'))$$,
  'P0001', 'pick_not_closed', 'A planned pick cannot be overridden');
reset role;
set local role anon;
select throws_ok($$select public.override_pick(pg_temp.id('closed'), pg_temp.id('o'))$$,
  '42501', null, 'Signed-out callers cannot override');
reset role;
select ok(has_function_privilege('authenticated', 'public.override_pick(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.override_pick(uuid,uuid)', 'EXECUTE'),
  'Only authenticated callers can invoke override_pick');
select * from finish();
rollback;
