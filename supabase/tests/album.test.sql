begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
-- The id of the item posted with client key k, read past RLS so any caller can name it.
create function pg_temp.item(k text) returns uuid language sql security definer as $$
  select id from public.album_items where client_key = pg_temp.id(k) $$;
-- How many items the caller can read.
create function pg_temp.seen() returns bigint language sql as $$ select count(*) from public.album_items $$;

-- Fixture: maya organizes `past`. a, b, c and ex went (Going + attendance yes); d is Going but said no; e is awaiting.
-- gm is in the group but not on any plan; outsider is in no group. Plans: past, draft, cancelled, solo (no group).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','e','ex','gm','outsider','nameless']) n;
update profiles set display_name = 'Name of ' || id::text where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n)
  from unnest(array['maya','a','b','c','d','e','ex','gm']) n;
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, source, status)
  values (pg_temp.id('e1'), 'Clay', 'art', 'exact', 20, 20, 'flexible', 'PLACEHOLDER: album test', 'published');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  select pg_temp.id(k), case k when 'solo' then null else pg_temp.id('g') end, pg_temp.id('maya'),
         pg_temp.id('e1'), 'Clay ' || k, 'art',
         case k when 'draft' then 'draft' when 'cancelled' then 'cancelled' else 'sent' end, 1, pg_temp.id(k || 'k')
  from unnest(array['past','draft','cancelled','solo']) k;
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  select pg_temp.id(k), 1, now() - interval '5 hours', now() - interval '3 hours', 'Door', '{"kind":"exact","min":20,"max":20}', false
  from unnest(array['past','draft','cancelled','solo']) k;
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id(k), pg_temp.id(n), case when n = 'e' then 'awaiting' else 'going' end, 1
  from unnest(array['past','draft','cancelled','solo']) k, unnest(array['maya','a','b','c','d','e','ex']) n;
insert into attendance (plan_id, user_id, attended)
  select pg_temp.id(k), pg_temp.id(n), case when n = 'd' then 'no' else 'yes' end
  from unnest(array['past','draft','cancelled','solo']) k, unnest(array['a','b','c','d','ex']) n;

select has_table('public', 'album_items', 'album_items exists');
select has_table('public', 'album_reports', 'album_reports exists');
select has_function('public', 'add_album_item', array['uuid','uuid','text','text','text'], 'add_album_item has the agreed arguments');
select has_function('public', 'delete_album_item', array['uuid'], 'delete_album_item has the agreed arguments');
select has_function('public', 'report_album_item', array['uuid'], 'report_album_item has the agreed arguments');
select has_function('public', 'share_album_item', array['uuid'], 'share_album_item has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.add_album_item(uuid,uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.delete_album_item(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.report_album_item(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.share_album_item(uuid)', 'EXECUTE'), 'Signed-out clients can call none of them');
select ok(not has_table_privilege('authenticated', 'public.album_items', 'INSERT')
  and not has_table_privilege('authenticated', 'public.album_items', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.album_items', 'DELETE')
  and not has_table_privilege('authenticated', 'public.album_reports', 'INSERT')
  and not has_table_privilege('authenticated', 'public.album_reports', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.album_reports', 'DELETE'), 'Clients cannot write either table');
select ok(not has_table_privilege('anon', 'public.album_items', 'SELECT')
  and not has_table_privilege('anon', 'public.album_reports', 'SELECT'), 'Signed-out clients read neither table');

set local role authenticated;

-- Who may post
select pg_temp.as_user('e');
select throws_ok($$select add_album_item(pg_temp.id('k-e'), pg_temp.id('past'), 'note', null, 'hi')$$, '42501', 'not_attended', 'An invitee who never answered Going cannot post');
select pg_temp.as_user('d');
select throws_ok($$select add_album_item(pg_temp.id('k-d'), pg_temp.id('past'), 'note', null, 'hi')$$, '42501', 'not_attended', 'An invitee who said they did not go cannot post');
select pg_temp.as_user('gm');
select throws_ok($$select add_album_item(pg_temp.id('k-gm'), pg_temp.id('past'), 'note', null, 'hi')$$, '42501', 'not_attended', 'A group member who is not on the plan cannot post');
select pg_temp.as_user('outsider');
select throws_ok($$select add_album_item(pg_temp.id('k-o'), pg_temp.id('past'), 'note', null, 'hi')$$, '42501', 'not_attended', 'A stranger cannot post');
select pg_temp.as_user('nameless');
select throws_ok($$select add_album_item(pg_temp.id('k-n'), pg_temp.id('past'), 'note', null, 'hi')$$, 'P0001', 'profile_required', 'A finished profile is required');
select pg_temp.as_user('a');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('draft'), 'note', null, 'hi')$$, '42501', 'not_attended', 'A draft has no album');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('cancelled'), 'note', null, 'hi')$$, '42501', 'not_attended', 'A cancelled plan has no album');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), gen_random_uuid(), 'note', null, 'hi')$$, '42501', 'not_attended', 'A missing plan gives the same error');

-- Field rules
select throws_ok($$select add_album_item(null, pg_temp.id('past'), 'note', null, 'hi')$$, 'P0001', 'invalid_client_key', 'A client_key is required');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'video', null, 'hi')$$, 'P0001', 'invalid_kind', 'Unknown kind is refused');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), null, null, 'hi')$$, 'P0001', 'invalid_kind', 'Null kind is refused');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'photo', null, null)$$, 'P0001', 'storage_path_required', 'A photo needs a storage path');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'photo', '  ', null)$$, 'P0001', 'storage_path_required', 'A blank storage path is no path');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'note', 'x/y.jpg', 'hi')$$, 'P0001', 'invalid_storage_path', 'A note has no file');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'note', null, null)$$, 'P0001', 'note_required', 'A note needs text');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'note', null, '   ')$$, 'P0001', 'note_required', 'A blank note is no note');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'note', null, repeat('x', 501))$$, 'P0001', 'note_too_long', 'A 501 character note is refused');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'photo', 'x/y.jpg', repeat('x', 501))$$, 'P0001', 'note_too_long', 'A 501 character caption is refused');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'photo', repeat('x', 501), null)$$, 'P0001', 'invalid_storage_path', 'A very long storage path is refused');
select is((select count(*) from public.album_items), 0::bigint, 'Refused calls stored nothing');

-- Posting, and retries with the same client_key
select lives_ok($$select add_album_item(pg_temp.id('p1'), pg_temp.id('past'), 'photo', 'a/past/1.jpg', null)$$, 'a posts a photo');
select lives_ok($$select add_album_item(pg_temp.id('n1'), pg_temp.id('past'), 'note', null, repeat('x', 500))$$, 'a posts a 500 character note');
select is((select add_album_item(pg_temp.id('p1'), pg_temp.id('past'), 'photo', 'a/past/1.jpg', null)), pg_temp.item('p1'),
  'The same client_key again returns the same item');
select is((select count(*) from public.album_items where client_key = pg_temp.id('p1')), 1::bigint, 'The same client_key twice makes one row');
select is((select count(*) from public.album_items), 2::bigint, 'a has two items');
select throws_ok($$select add_album_item(pg_temp.id('p1'), pg_temp.id('past'), 'photo', 'a/past/other.jpg', null)$$, 'P0001', 'client_key_conflict', 'The same key with a different file is a conflict');
select throws_ok($$select add_album_item(pg_temp.id('p1'), pg_temp.id('solo'), 'photo', 'a/past/1.jpg', null)$$, 'P0001', 'client_key_conflict', 'The same key on another plan is a conflict');
select throws_ok($$select add_album_item(pg_temp.id('k-x'), pg_temp.id('past'), 'photo', 'a/past/1.jpg', null)$$, 'P0001', 'invalid_storage_path', 'Two items cannot point at one file');
select is((select audience from public.album_items where id = pg_temp.item('p1')), 'plan', 'A new item is visible to the plan only');
select is((select reported_count from public.album_items where id = pg_temp.item('p1')), 0, 'A new item has no reports');
select pg_temp.as_user('b');
select throws_ok($$select add_album_item(pg_temp.id('p1'), pg_temp.id('past'), 'photo', 'a/past/1.jpg', null)$$, 'P0001', 'client_key_conflict', 'Someone else''s client_key is a conflict');
select lives_ok($$select add_album_item(pg_temp.id('b-note'), pg_temp.id('past'), 'photo', 'b/past/1.jpg', 'Caption')$$, 'b posts a photo with a caption');

-- The 21st photo is refused; notes and other people are not affected
select pg_temp.as_user('a');
select lives_ok($$select add_album_item(gen_random_uuid(), pg_temp.id('past'), 'photo', 'a/past/bulk-' || g || '.jpg', null)
  from generate_series(2, 20) g$$, 'a posts photos 2 to 20');
select is((select count(*) from public.album_items where user_id = pg_temp.id('a') and kind = 'photo'), 20::bigint, 'a has 20 photos');
select throws_ok($$select add_album_item(pg_temp.id('p21'), pg_temp.id('past'), 'photo', 'a/past/21.jpg', null)$$, 'P0001', 'photo_limit', 'A 21st photo is refused');
select is((select add_album_item(pg_temp.id('p1'), pg_temp.id('past'), 'photo', 'a/past/1.jpg', null)), pg_temp.item('p1'),
  'Retrying an accepted photo at the limit returns it instead of failing');
select lives_ok($$select add_album_item(pg_temp.id('n2'), pg_temp.id('past'), 'note', null, 'Still fine')$$, 'The limit is for photos, not notes');
select lives_ok($$select add_album_item(pg_temp.id('a-solo'), pg_temp.id('solo'), 'photo', 'a/solo/1.jpg', null)$$, 'The limit is per plan');
select pg_temp.as_user('b');
select lives_ok($$select add_album_item(pg_temp.id('b2'), pg_temp.id('past'), 'photo', 'b/past/2.jpg', null)$$, 'The limit is per person');
select pg_temp.as_user('a');
select lives_ok($$select delete_album_item(pg_temp.item('p1'))$$, 'a deletes a photo');
select lives_ok($$select add_album_item(pg_temp.id('p21'), pg_temp.id('past'), 'photo', 'a/past/21.jpg', null)$$, 'A deleted photo frees its place');
select throws_ok($$select add_album_item(pg_temp.id('p22'), pg_temp.id('past'), 'photo', 'a/past/22.jpg', null)$$, 'P0001', 'photo_limit', 'The place is taken again');
select lives_ok($$select delete_album_item(pg_temp.item('p21'))$$, 'a deletes the new photo');
select lives_ok($$select add_album_item(pg_temp.id('p1b'), pg_temp.id('past'), 'photo', 'a/past/1.jpg', 'again')$$, 'A deleted photo''s path can be used again');

-- Reading: plan audience goes to the plan's invitees only
select is((select count(*) from public.album_items where user_id = pg_temp.id('a')), 23::bigint, 'The owner sees all of their own items (20 photos, 2 notes, 1 solo photo)');
select pg_temp.as_user('outsider');
select is(pg_temp.seen(), 0::bigint, 'Someone not on the plan cannot read a plan-audience item');
select pg_temp.as_user('gm');
select is(pg_temp.seen(), 0::bigint, 'A group member who is not on the plan cannot read a plan-audience item');
select pg_temp.as_user('e');
select is((select count(*) from public.album_items where user_id = pg_temp.id('a') and plan_id = pg_temp.id('past')), 22::bigint, 'An invitee who did not go can read a''s plan-audience items (they are on the plan)');
select pg_temp.as_user('c');
select is((select count(*) from public.album_items where id = pg_temp.item('n1')), 1::bigint, 'Another invitee reads a plan-audience note');

-- Sharing: owner only, plan to group, one way
select pg_temp.as_user('b');
select throws_ok($$select share_album_item(pg_temp.item('n1'))$$, '42501', 'not_found', 'Only the owner can share');
select pg_temp.as_user('gm');
select throws_ok($$select share_album_item(pg_temp.item('n1'))$$, '42501', 'not_found', 'A group member cannot share someone else''s item');
select throws_ok($$select share_album_item(gen_random_uuid())$$, '42501', 'not_found', 'A missing item gives the same error');
select pg_temp.as_user('a');
select throws_ok($$select share_album_item(pg_temp.item('a-solo'))$$, 'P0001', 'no_group', 'A plan with no group has nobody to share with');
select lives_ok($$select share_album_item(pg_temp.item('n1'))$$, 'a shares a note with the group');
select lives_ok($$select share_album_item(pg_temp.item('n1'))$$, 'Sharing again is accepted');
select is((select audience from public.album_items where id = pg_temp.item('n1')), 'group', 'The note is now visible to the group');
select is((select audience from public.album_items where id = pg_temp.item('n2')), 'plan', 'Other items stay with the plan');
select pg_temp.as_user('gm');
select is(pg_temp.seen(), 1::bigint, 'A current group member now reads the shared note and nothing else');
select pg_temp.as_user('outsider');
select is(pg_temp.seen(), 0::bigint, 'Someone outside the group still reads nothing');
select ok(not exists (select 1 from pg_proc where proname in ('unshare_album_item', 'update_album_item', 'set_album_audience')),
  'There is no way to go back from group to plan');
select throws_ok($$update public.album_items set audience = 'plan'$$, '42501', null, 'Clients cannot write the audience back');

-- Group membership: a member who leaves stops seeing group items; an invitee keeps seeing items of their own plan
reset role;
update group_members set removed_at = now() where group_id = pg_temp.id('g') and user_id in (pg_temp.id('gm'), pg_temp.id('ex'));
set local role authenticated;
select pg_temp.as_user('gm');
select is(pg_temp.seen(), 0::bigint, 'A member who left the group no longer reads group items');
select pg_temp.as_user('ex');
select is((select count(*) from public.album_items where id = pg_temp.item('n1')), 1::bigint, 'An invitee who left the group still reads items of the plan they were on');
reset role;
update group_members set removed_at = null where group_id = pg_temp.id('g') and user_id in (pg_temp.id('gm'), pg_temp.id('ex'));
set local role authenticated;

-- Reporting
select pg_temp.as_user('a');
select throws_ok($$select report_album_item(pg_temp.item('n1'))$$, 'P0001', 'own_item', 'Owners cannot report their own item');
select pg_temp.as_user('outsider');
select throws_ok($$select report_album_item(pg_temp.item('n1'))$$, '42501', 'not_found', 'Someone who cannot see an item cannot report it');
select throws_ok($$select report_album_item(pg_temp.item('n2'))$$, '42501', 'not_found', 'Reporting a plan-audience item from outside is not_found');
select throws_ok($$select report_album_item(gen_random_uuid())$$, '42501', 'not_found', 'A missing item gives the same error');
select pg_temp.as_user('b');
select is((select count(*) from public.album_items where id = pg_temp.item('n2')), 1::bigint, 'b sees n2 before reporting');
select lives_ok($$select report_album_item(pg_temp.item('n2'))$$, 'b reports n2');
select is((select count(*) from public.album_items where id = pg_temp.item('n2')), 0::bigint, 'A reporter no longer sees the item');
select lives_ok($$select report_album_item(pg_temp.item('n2'))$$, 'Reporting again is accepted');
select is((select count(*) from public.album_reports), 1::bigint, 'b can read only their own report');
select pg_temp.as_user('c');
select is((select count(*) from public.album_items where id = pg_temp.item('n2')), 1::bigint, 'Other people still see a reported item');
select is((select reported_count from public.album_items where id = pg_temp.item('n2')), 1, 'Reporting twice counts once');
select is((select count(*) from public.album_reports), 0::bigint, 'c cannot read b''s report');
select lives_ok($$select report_album_item(pg_temp.item('n2'))$$, 'c reports n2');
select pg_temp.as_user('a');
select is((select reported_count from public.album_items where id = pg_temp.item('n2')), 2, 'Each reporter adds one');
select is((select count(*) from public.album_items where id = pg_temp.item('n2')), 1::bigint, 'The owner still sees their reported item');

-- Deleting
select pg_temp.as_user('b');
select throws_ok($$select delete_album_item(pg_temp.item('n2'))$$, '42501', 'not_found', 'Only the owner can delete');
select pg_temp.as_user('outsider');
select throws_ok($$select delete_album_item(pg_temp.item('n2'))$$, '42501', 'not_found', 'A stranger cannot delete');
select throws_ok($$select delete_album_item(gen_random_uuid())$$, '42501', 'not_found', 'A missing item gives the same error');
select pg_temp.as_user('nameless');
select throws_ok($$select delete_album_item(pg_temp.item('n2'))$$, 'P0001', 'profile_required', 'A finished profile is required');
select pg_temp.as_user('a');
select lives_ok($$select delete_album_item(pg_temp.item('n2'))$$, 'a deletes their reported note');
reset role;
select is((select count(*) from public.album_items where client_key = pg_temp.id('n2')), 0::bigint, 'A deleted item is gone from the table');
select is((select count(*) from public.album_reports where item_id is not null and item_id not in (select id from public.album_items)), 0::bigint, 'Its reports went with it');
set local role authenticated;
select pg_temp.as_user('c');
select is((select count(*) from public.album_items where client_key = pg_temp.id('n2')), 0::bigint, 'A deleted item is gone for the people who saw it');
select pg_temp.as_user('b');
select is((select count(*) from public.album_items where client_key = pg_temp.id('n2')), 0::bigint, 'A deleted item is gone for its reporter');
select pg_temp.as_user('gm');
select is((select count(*) from public.album_items where client_key = pg_temp.id('n2')), 0::bigint, 'A deleted item is gone for the group');

-- The owner can delete after leaving the group and after being removed from the plan
select pg_temp.as_user('ex');
select lives_ok($$select add_album_item(pg_temp.id('ex1'), pg_temp.id('past'), 'photo', 'ex/past/1.jpg', null)$$, 'ex posts a photo');
select lives_ok($$select share_album_item(pg_temp.item('ex1'))$$, 'ex shares it with the group');
reset role;
update group_members set removed_at = now() where group_id = pg_temp.id('g') and user_id = pg_temp.id('ex');
update rsvps set removed_at = now() where plan_id = pg_temp.id('past') and user_id = pg_temp.id('ex');
set local role authenticated;
select pg_temp.as_user('ex');
select throws_ok($$select add_album_item(pg_temp.id('ex2'), pg_temp.id('past'), 'photo', 'ex/past/2.jpg', null)$$, '42501', 'not_attended', 'Someone removed from the plan cannot post more');
select is((select count(*) from public.album_items where id = pg_temp.item('ex1')), 1::bigint, 'The owner still sees their own item after leaving');
select lives_ok($$select delete_album_item(pg_temp.item('ex1'))$$, 'The owner deletes it after leaving the group and the plan');
select pg_temp.as_user('gm');
select is((select count(*) from public.album_items where client_key = pg_temp.id('ex1')), 0::bigint, 'It is gone for the group');

-- Account deletion removes the person's items and the reports they made
select pg_temp.as_user('c');
select lives_ok($$select report_album_item(pg_temp.item('b-note'))$$, 'c reports b''s photo');
select pg_temp.as_user('b');
select lives_ok($$select delete_account()$$, 'b deletes their account');
reset role;
select is((select count(*) from public.album_items where user_id = pg_temp.id('b')), 0::bigint, 'Their items are gone');
select is((select count(*) from public.album_reports where item_id not in (select id from public.album_items)), 0::bigint, 'No report points at a missing item');

select * from finish();
rollback;
