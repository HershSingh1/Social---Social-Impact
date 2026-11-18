begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.today() returns date language sql as
  $$select (now() at time zone 'America/Chicago')::date$$;

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
  (pg_temp.id('kayak'), 'Kayak', 'Outdoors', 'exact', 'flexible', 'PLACEHOLDER: bucket test', 'published'),
  (pg_temp.id('lights'), 'Lights', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: bucket test', 'published'),
  (pg_temp.id('zilker'), 'Zilker', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: bucket test', 'published'),
  (pg_temp.id('removed'), 'Old place', 'Outdoors', 'free', 'unknown', 'PLACEHOLDER: bucket test', 'removed');

select has_table('public', 'bucket_items', 'Bucket items table exists');
select has_function('public', 'set_bucket_item', array['uuid','uuid','boolean'], 'Bucket RPC has the agreed arguments');
select has_table('public', 'collections', 'Collections table exists');
select has_table('public', 'collection_items', 'Collection items table exists');
select ok(has_table_privilege('authenticated', 'public.bucket_items', 'SELECT')
  and not has_table_privilege('authenticated', 'public.bucket_items', 'INSERT')
  and not has_table_privilege('authenticated', 'public.bucket_items', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.bucket_items', 'DELETE'),
  'Clients read bucket items but never write them');
select ok(has_table_privilege('authenticated', 'public.collections', 'SELECT')
  and has_table_privilege('authenticated', 'public.collection_items', 'SELECT')
  and not has_table_privilege('authenticated', 'public.collections', 'INSERT')
  and not has_table_privilege('authenticated', 'public.collections', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.collections', 'DELETE')
  and not has_table_privilege('authenticated', 'public.collection_items', 'INSERT')
  and not has_table_privilege('authenticated', 'public.collection_items', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.collection_items', 'DELETE'),
  'Clients read collections but never write them');
select ok(not has_function_privilege('anon', 'public.set_bucket_item(uuid,uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.group_bucket_list(uuid)', 'EXECUTE'),
  'Signed-out clients cannot call the bucket functions');

-- Bucket list
set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$, 'Alice adds Kayak');
select lives_ok($$select public.set_bucket_item(pg_temp.id('lights'), pg_temp.id('g1'), true)$$, 'Alice adds Lights');
select throws_ok(
  $$insert into bucket_items (group_id, experience_id, user_id)
      values (pg_temp.id('g1'), pg_temp.id('zilker'), pg_temp.id('alice'))$$,
  '42501', null, 'Direct client insert is rejected');

-- Retrying a request never does anything extra.
select lives_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$,
  'The same add sent again is accepted');
select is((select count(*) from bucket_items where user_id = pg_temp.id('alice') and experience_id = pg_temp.id('kayak')),
  1::bigint, 'Adding twice leaves one item');
select is((select count(*) from bucket_items where user_id = pg_temp.id('alice')), 2::bigint,
  'Adding twice changes nothing else');

select pg_temp.as_user('bob');
select lives_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$, 'Bob adds Kayak too');
select is((select want_count from public.group_bucket_list(pg_temp.id('g1')) where experience_id = pg_temp.id('kayak')),
  2::bigint, 'Two members adding the same experience gives count 2');
select is((select want_count from public.group_bucket_list(pg_temp.id('g1')) where experience_id = pg_temp.id('lights')),
  1::bigint, 'An experience one member added has count 1');
select is((select array_agg(experience_id order by ordinality) from public.group_bucket_list(pg_temp.id('g1'))
    with ordinality), array[pg_temp.id('kayak'), pg_temp.id('lights')],
  'The list is ordered by how many members added each experience');
select is((select user_ids from public.group_bucket_list(pg_temp.id('g1')) where experience_id = pg_temp.id('lights')),
  array[pg_temp.id('alice')], 'Members see who added each item, as on Saved ideas');

select lives_ok($$select public.set_bucket_item(pg_temp.id('zilker'), pg_temp.id('g1'), true)$$, 'Bob adds Zilker');
select lives_ok($$select public.set_bucket_item(pg_temp.id('zilker'), pg_temp.id('g1'), false)$$, 'Bob removes Zilker');
select lives_ok($$select public.set_bucket_item(pg_temp.id('zilker'), pg_temp.id('g1'), false)$$,
  'Removing an item already removed is accepted');
select is((select count(*) from bucket_items where experience_id = pg_temp.id('zilker')), 0::bigint,
  'Removing twice leaves it removed');
select lives_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), false)$$,
  'Bob removes only his own Kayak item');
select is((select want_count from public.group_bucket_list(pg_temp.id('g1')) where experience_id = pg_temp.id('kayak')),
  1::bigint, 'Alice''s Kayak item is untouched');
select lives_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$, 'Bob adds Kayak back');

select throws_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), null)$$,
  'P0001', 'invalid_wanted', 'A missing wanted value is refused');
select throws_ok($$select public.set_bucket_item(pg_temp.id('removed'), pg_temp.id('g1'), true)$$,
  'P0001', 'experience_not_found', 'A removed listing cannot be newly added');
select throws_ok($$select public.set_bucket_item(pg_temp.id('missing'), pg_temp.id('g1'), true)$$,
  'P0001', 'experience_not_found', 'An unknown listing cannot be added');
select throws_ok($$select public.set_bucket_item(pg_temp.id('kayak'), null, true)$$,
  '42501', 'not_a_member', 'A group is required');

select pg_temp.as_user('carol');
select throws_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$,
  '42501', 'not_a_member', 'A nonmember cannot add to another group''s list');
select throws_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), false)$$,
  '42501', 'not_a_member', 'A nonmember cannot remove from another group''s list');
select is((select count(*) from bucket_items), 0::bigint, 'A nonmember reads no bucket items');
select is((select count(*) from public.group_bucket_list(pg_temp.id('g1'))), 0::bigint,
  'A nonmember gets an empty list from group_bucket_list');
select lives_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g2'), true)$$,
  'Carol adds Kayak in her own group');
select is((select count(*) from public.group_bucket_list(pg_temp.id('g1'))), 0::bigint,
  'Another group''s items never leak into this one');

select pg_temp.as_user('nameless');
select throws_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$,
  'P0001', 'profile_required', 'A completed profile is required');

-- Leaving the group clears that person's items there only.
reset role;
update group_members set removed_at = now()
  where group_id = pg_temp.id('g1') and user_id = pg_temp.id('bob');
select is((select count(*) from bucket_items where user_id = pg_temp.id('bob') and group_id = pg_temp.id('g1')),
  0::bigint, 'Leaving the group clears Bob''s items');
select is((select count(*) from bucket_items where user_id = pg_temp.id('alice') and group_id = pg_temp.id('g1')),
  2::bigint, 'Leaving does not touch another member''s items');
select is((select count(*) from bucket_items where group_id = pg_temp.id('g2')),
  1::bigint, 'Leaving one group does not touch another group');
set local role authenticated;
select pg_temp.as_user('bob');
select throws_ok($$select public.set_bucket_item(pg_temp.id('kayak'), pg_temp.id('g1'), true)$$,
  '42501', 'not_a_member', 'A member who left can no longer add');

-- Blocking clears too.
reset role;
update group_members set removed_at = null, blocked = false
  where group_id = pg_temp.id('g1') and user_id = pg_temp.id('bob');
set local role authenticated;
select pg_temp.as_user('bob');
select lives_ok($$select public.set_bucket_item(pg_temp.id('lights'), pg_temp.id('g1'), true)$$, 'Bob rejoins and adds Lights');
reset role;
update group_members set blocked = true where group_id = pg_temp.id('g1') and user_id = pg_temp.id('bob');
select is((select count(*) from bucket_items where user_id = pg_temp.id('bob') and group_id = pg_temp.id('g1')),
  0::bigint, 'Being blocked clears Bob''s items');

-- Seasonal collections
insert into collections (id, name, curator_name, starts_on, ends_on, review_on) values
  (pg_temp.id('c_now'), 'Fall in Austin', 'Maya', pg_temp.today() - 10, pg_temp.today() + 10, pg_temp.today() + 5),
  (pg_temp.id('c_last_day'), 'Ends today', 'Maya', pg_temp.today() - 10, pg_temp.today(), pg_temp.today() - 5),
  (pg_temp.id('c_first_day'), 'Starts today', 'Maya', pg_temp.today(), pg_temp.today() + 10, pg_temp.today() + 5),
  (pg_temp.id('c_ended'), 'Ended yesterday', 'Maya', pg_temp.today() - 10, pg_temp.today() - 1, pg_temp.today() - 5),
  (pg_temp.id('c_future'), 'Starts tomorrow', 'Maya', pg_temp.today() + 1, pg_temp.today() + 10, pg_temp.today() + 5);
insert into collection_items (collection_id, experience_id) values
  (pg_temp.id('c_now'), pg_temp.id('kayak')),
  (pg_temp.id('c_ended'), pg_temp.id('kayak')),
  (pg_temp.id('c_future'), pg_temp.id('lights'));

set local role authenticated;
select pg_temp.as_user('outsider');
select is((select array_agg(name order by name) from collections),
  array['Ends today', 'Fall in Austin', 'Starts today'],
  'Only collections between starts_on and ends_on are readable, both end days included');
select is((select count(*) from collections where id = pg_temp.id('c_ended')), 0::bigint,
  'A collection stops being readable the day after ends_on');
select is((select count(*) from collections where id = pg_temp.id('c_future')), 0::bigint,
  'A collection is not readable before starts_on');
select is((select count(*) from collection_items where collection_id = pg_temp.id('c_now')), 1::bigint,
  'Items of an in-season collection are readable');
select is((select count(*) from collection_items where collection_id in (pg_temp.id('c_ended'), pg_temp.id('c_future'))),
  0::bigint, 'Items of an ended or future collection are hidden with it');
select throws_ok(
  $$insert into collections (name, curator_name, starts_on, ends_on, review_on)
      values ('x', 'y', pg_temp.today(), pg_temp.today(), pg_temp.today())$$,
  '42501', null, 'Clients cannot create collections');
select throws_ok(
  $$insert into collection_items (collection_id, experience_id)
      values (pg_temp.id('c_now'), pg_temp.id('lights'))$$,
  '42501', null, 'Clients cannot add collection items');
select throws_ok($$update collections set name = 'Hacked'$$, '42501', null, 'Clients cannot rename collections');
select throws_ok($$delete from collections$$, '42501', null, 'Clients cannot delete collections');
reset role;
select is((select count(*) from collections), 5::bigint, 'The rows are still all there for admins');

-- The window itself is checked by the database.
select throws_ok(
  $$insert into collections (name, curator_name, starts_on, ends_on, review_on)
      values ('Backwards', 'Maya', pg_temp.today(), pg_temp.today() - 1, pg_temp.today())$$,
  '23514', null, 'A collection cannot end before it starts');

select * from finish();
rollback;
