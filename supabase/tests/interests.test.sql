begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['alice','bob','nameless']) n;
update profiles set display_name = 'Named user' where id <> pg_temp.id('nameless');

select has_table('public', 'interests', 'Interests table exists');
select has_function('public', 'set_interests', array['jsonb'], 'set_interests takes one jsonb argument (N6)');
select ok(has_table_privilege('authenticated', 'public.interests', 'SELECT'), 'Clients can read interests under RLS');
select ok(not has_table_privilege('authenticated', 'public.interests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.interests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.interests', 'DELETE'), 'Clients cannot write interests directly');
select ok(not has_table_privilege('anon', 'public.interests', 'SELECT'), 'Signed-out clients cannot read interests');
select is(position('interests' in pg_get_functiondef('public.get_profile_cards(uuid[])'::regprocedure)), 0,
  'Profile cards shown to groups do not read interests');

set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$select public.set_interests('{"brunch": "yes", "hiking": "yes", "film": "maybe", "comedy": "no"}')$$,
  'Alice stores her answers');
select results_eq($$select category, answer from interests order by category$$,
  $$values ('brunch', 'yes'), ('comedy', 'no'), ('film', 'maybe'), ('hiking', 'yes')$$,
  'Alice reads back exactly what she sent');

select lives_ok($$select public.set_interests('{"coffee": "yes", "hiking": "maybe"}')$$, 'Alice answers again');
select results_eq($$select category, answer from interests order by category$$,
  $$values ('coffee', 'yes'), ('hiking', 'maybe')$$,
  'The new answers replace all the old ones');

select throws_ok($$select public.set_interests('{"coffee": "yes", "pottery": "yes"}')$$,
  '22023', 'unknown_category', 'A category that is not a Figma 1.4 chip is rejected');
select throws_ok($$select public.set_interests('{"coffee": "sure"}')$$,
  '22023', 'invalid_answer', 'An answer other than yes, maybe or no is rejected');
select throws_ok($$select public.set_interests('{"coffee": true}')$$,
  '22023', 'invalid_answer', 'A non-string answer is rejected');
select throws_ok($$select public.set_interests('["coffee"]')$$,
  '22023', 'invalid_answers', 'A list instead of an object is rejected');
select throws_ok($$select public.set_interests(null)$$,
  '22023', 'invalid_answers', 'Null is rejected; clearing uses {}');
select is((select count(*) from interests), 2::bigint, 'A rejected call leaves the earlier answers in place');
select throws_ok($$insert into interests (user_id, category, answer) values (pg_temp.id('alice'), 'film', 'yes')$$,
  '42501', null, 'Direct client insert is rejected');

select pg_temp.as_user('bob');
select is((select count(*) from interests), 0::bigint, 'Bob cannot read Alice''s interests');
select lives_ok($$select public.set_interests('{"concerts": "yes"}')$$, 'Bob stores his own answers');
select is((select count(*) from interests), 1::bigint, 'Bob sees only his own row');

select pg_temp.as_user('alice');
select lives_ok($$select public.set_interests('{}')$$, 'Alice clears her answers');
select is((select count(*) from interests), 0::bigint, 'Clearing removes all of Alice''s rows');

select pg_temp.as_user('nameless');
select throws_ok($$select public.set_interests('{"film": "yes"}')$$,
  'P0001', 'profile_required', 'A person without a name cannot store interests yet');

reset role;
select is((select count(*) from interests where user_id = pg_temp.id('bob')), 1::bigint,
  'Clearing Alice''s answers did not touch Bob''s');
select is((select count(*) from events), 0::bigint, 'Storing interests writes nothing to the event log');

set local role authenticated;
select pg_temp.as_user('bob');
select public.delete_account();
reset role;
select is((select count(*) from interests where user_id = pg_temp.id('bob')), 0::bigint,
  'Deleting the account deletes the person''s interests');

select * from finish();
rollback;
