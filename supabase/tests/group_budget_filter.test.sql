begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
-- The ids from a hidden-list as sorted text, so results compare without depending on order.
create function pg_temp.sorted(ids uuid[]) returns text language sql immutable as
  $$ select coalesce(string_agg(x::text, ',' order by x), '') from unnest(ids) x $$;
create function pg_temp.ids(names text[]) returns uuid[] language sql immutable as
  $$ select array_agg(pg_temp.id(n)) from unnest(names) n $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan','sam','kim','outsider','nameless']) n;
update profiles set display_name = initcap(id::text) where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n) from unnest(array['maya','jordan','sam','kim']) n;

insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, source, status) values
  (pg_temp.id('cheap'),      'Cheap',       'x', 'exact',     15, 15,   'flexible', 'PLACEHOLDER:test', 'published'),
  (pg_temp.id('mid'),        'Mid',         'x', 'exact',     25, 25,   'flexible', 'PLACEHOLDER:test', 'published'),
  (pg_temp.id('free'),       'Free',        'x', 'free',      null, null, 'flexible', 'PLACEHOLDER:test', 'published'),
  (pg_temp.id('unknown'),    'Unknown',     'x', 'unknown',   null, null, 'flexible', 'PLACEHOLDER:test', 'published'),
  (pg_temp.id('range_low'),  'Range low',   'x', 'estimated', 10, 50,   'flexible', 'PLACEHOLDER:test', 'published'),
  (pg_temp.id('range_high'), 'Range high',  'x', 'estimated', 30, 50,   'flexible', 'PLACEHOLDER:test', 'published'),
  (pg_temp.id('draft'),      'Draft',       'x', 'exact',     90, 90,   'flexible', 'PLACEHOLDER:test', 'draft');

select has_function('public', 'set_budget_opt_in', array['boolean'], 'set_budget_opt_in exists');
select has_function('public', 'group_budget_hidden', array['uuid','uuid[]'], 'group_budget_hidden exists');
select is((select prorettype::regtype::text from pg_proc where oid = 'public.group_budget_hidden(uuid,uuid[])'::regprocedure), 'uuid[]',
  'The filter returns only a list of ids');
select ok(not has_function_privilege('anon', 'public.set_budget_opt_in(boolean)', 'EXECUTE'), 'Signed-out clients cannot opt in');
select ok(not has_function_privilege('anon', 'public.group_budget_hidden(uuid,uuid[])', 'EXECUTE'), 'Signed-out clients cannot use the filter');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'budget_opt_in', 'UPDATE'), 'Clients cannot write the opt-in directly');
select is((select column_default || '/' || is_nullable from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'budget_opt_in'), 'false/NO', 'Opt-in starts off');

-- Caps are odd numbers on purpose, so a leak is easy to spot in text.
set local role authenticated;
select pg_temp.as_user('maya');   select set_profile_defaults(20.37, null);
select pg_temp.as_user('jordan'); select set_profile_defaults(40.52, null);
select pg_temp.as_user('sam');    select set_profile_defaults(60.91, null);

-- Fewer than 3 opted in -> null
select pg_temp.as_user('maya');   select lives_ok($$select set_budget_opt_in(true)$$, 'Maya opts in');
select pg_temp.as_user('jordan'); select lives_ok($$select set_budget_opt_in(true)$$, 'Jordan opts in');
select pg_temp.as_user('maya');
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid'])), null::uuid[], 'Two opted in: null');
select is(group_budget_hidden(pg_temp.id('g'), null), null::uuid[], 'Two opted in, no ids: still null');

-- Three caps but only two opted in -> null
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid'])), null::uuid[], 'Three caps, two opted in: null');

-- Opted in without a cap does not count
select pg_temp.as_user('kim');    select lives_ok($$select set_budget_opt_in(true)$$, 'Kim opts in without any cap');
select pg_temp.as_user('maya');
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid'])), null::uuid[], 'Three opted in but only two with a cap: null');

-- Three opted in with a cap -> hide above the lowest cap (20.37)
select pg_temp.as_user('sam');    select lives_ok($$select set_budget_opt_in(true)$$, 'Sam opts in');
select pg_temp.as_user('jordan');
select is(pg_temp.sorted(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid']))), pg_temp.id('mid')::text,
  'Caps 20, 40, 60: a $25 activity is hidden and a $15 one is shown');
select is(pg_temp.sorted(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid','free','unknown','range_low','range_high','draft']))),
  pg_temp.sorted(pg_temp.ids(array['mid','range_high'])),
  'Free, unknown-price, cheap, low-start ranges and unpublished rows are not listed');
select is(group_budget_hidden(pg_temp.id('g'), '{}'), '{}'::uuid[], 'No ids in, none out');
select is(group_budget_hidden(pg_temp.id('g'), null), '{}'::uuid[], 'A null id list gives an empty list');
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['nothing_here'])), '{}'::uuid[], 'An unknown id is ignored');
select is(pg_temp.sorted(group_budget_hidden(pg_temp.id('g'), array[pg_temp.id('mid'), pg_temp.id('mid')])), pg_temp.id('mid')::text,
  'A repeated id is listed once');

-- Any member may ask, opted in or not, and the answer is the same
select pg_temp.as_user('kim');
select is(pg_temp.sorted(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid']))), pg_temp.id('mid')::text,
  'A member who has not set a cap gets the same answer');

-- The answer carries no cap anywhere
select ok(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid','range_high']))::text !~ '(20\.37|40\.52|60\.91|20\.|40\.|60\.)',
  'The full result contains no cap');
select ok(to_jsonb(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['mid'])))::text !~ '(20\.37|40\.52|60\.91)',
  'The result as JSON contains no cap');
select is((select count(*) from unnest(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid','range_high']))) x), 2::bigint,
  'The result is exactly the ids and nothing else');

-- Opt-in and caps stay private
select pg_temp.as_user('jordan');
select is((select count(*) from profiles), 1::bigint, 'Jordan reads only his own profile row');
select is((select count(*) from profiles where id <> pg_temp.id('jordan')), 0::bigint, 'Nobody else''s opt-in or cap can be read');
select ok(not (to_jsonb((select c from get_profile_cards(array[pg_temp.id('maya')]) c)) ? 'budget_opt_in'), 'The profile card carries no opt-in');
reset role;
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name in ('plans', 'plan_revisions', 'rsvps', 'picks', 'pick_options', 'groups', 'group_members', 'experiences')
  and column_name in ('budget_opt_in', 'budget_cap')), 'No other table has an opt-in or a cap');

-- Lowest cap follows who is still in the group
update group_members set removed_at = now() where group_id = pg_temp.id('g') and user_id = pg_temp.id('maya');
set local role authenticated;
select pg_temp.as_user('jordan');
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid'])), null::uuid[], 'A removed member no longer counts: back to two, so null');
select pg_temp.as_user('kim'); select set_profile_defaults(100.08, null);
select pg_temp.as_user('jordan');
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid','range_high'])), '{}'::uuid[],
  'With Maya gone the lowest cap is higher, so the $25 and $30 activities show');
reset role;
update group_members set removed_at = null where group_id = pg_temp.id('g') and user_id = pg_temp.id('maya');
update group_members set blocked = true where group_id = pg_temp.id('g') and user_id = pg_temp.id('sam');
set local role authenticated;
select pg_temp.as_user('jordan');
select is(pg_temp.sorted(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid']))), pg_temp.id('mid')::text,
  'A blocked member does not count, but three others still do');
reset role;
update group_members set blocked = false where group_id = pg_temp.id('g') and user_id = pg_temp.id('sam');
set local role authenticated;

-- Opting out takes the person out of the count (Kim now has a cap too, so it takes two opt-outs to get below 3)
select pg_temp.as_user('sam'); select set_budget_opt_in(false);
select pg_temp.as_user('jordan');
select is(pg_temp.sorted(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid']))), pg_temp.id('mid')::text, 'Three still count after Sam opts out');
select pg_temp.as_user('kim'); select set_budget_opt_in(false);
select pg_temp.as_user('jordan');
select is(group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid'])), null::uuid[], 'Opting out drops the count below 3: null');
select pg_temp.as_user('sam'); select set_budget_opt_in(true);

-- Refusals, and what their text says
select pg_temp.as_user('outsider');
select throws_ok($$select group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['cheap','mid']))$$, '42501', 'not_a_member',
  'A non-member is refused, with a message that names no value');
select pg_temp.as_user('outsider');
select lives_ok($$select set_budget_opt_in(true)$$, 'A person outside any group can still set their own opt-in');
select throws_ok($$select group_budget_hidden(pg_temp.id('nogroup'), pg_temp.ids(array['mid']))$$, '42501', 'not_a_member', 'An unknown group looks the same as a group you are not in');
select pg_temp.as_user('jordan');
select throws_ok($$select set_budget_opt_in(null)$$, 'P0001', 'invalid_opt_in', 'A missing opt-in is refused');
select throws_ok($$select group_budget_hidden(pg_temp.id('g'), (select array_agg(gen_random_uuid()) from generate_series(1, 501)))$$, 'P0001', 'too_many_experiences',
  'More than 500 ids is refused');
select pg_temp.as_user('nameless');
select throws_ok($$select set_budget_opt_in(true)$$, 'P0001', 'profile_required', 'A finished profile is required to opt in');
select throws_ok($$select group_budget_hidden(pg_temp.id('g'), pg_temp.ids(array['mid']))$$, 'P0001', 'profile_required', 'A finished profile is required to ask');

select * from finish();
rollback;
