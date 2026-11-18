begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
-- The file name <plan>/<user>/<file>.jpg
create function pg_temp.path(pl text, u text, f text) returns text language sql immutable as
  $$ select pg_temp.id(pl)::text || '/' || pg_temp.id(u)::text || '/' || f || '.jpg' $$;
create function pg_temp.upload(p text) returns void language sql as
  $$ insert into storage.objects (id, bucket_id, name) values (gen_random_uuid(), 'album', p) $$;
-- The Edge Function writes through the service role after it calls authorize_album_photo_upload.
create function pg_temp.server_upload(p text) returns void language sql security definer as
  $$ insert into storage.objects (id, bucket_id, name) values (gen_random_uuid(), 'album', p) $$;
-- How many album files the caller can list, optionally one name.
create function pg_temp.files(p text default null) returns bigint language sql as
  $$ select count(*) from storage.objects where bucket_id = 'album' and (p is null or name = p) $$;
-- How many album files exist at all, past RLS.
create function pg_temp.exists_file(p text) returns bigint language sql security definer as
  $$ select count(*) from storage.objects where bucket_id = 'album' and name = p $$;
create function pg_temp.item(k text) returns uuid language sql security definer as $$
  select id from public.album_items where client_key = pg_temp.id(k) $$;

-- Fixture: maya organizes `past` (sent, group g). a, b, c went; d is Going but said no; gm is in the group but
-- not on the plan; outsider is in no group. `draft` is a draft plan with the same people.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','gm','outsider']) n;
update profiles set display_name = 'Name of ' || id::text;
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n)
  from unnest(array['maya','a','b','c','d','gm']) n;
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, source, status)
  values (pg_temp.id('e1'), 'Clay', 'art', 'exact', 20, 20, 'flexible', 'PLACEHOLDER: album storage test', 'published');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  select pg_temp.id(k), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('e1'), 'Clay ' || k, 'art',
         case k when 'draft' then 'draft' else 'sent' end, 1, pg_temp.id(k || 'k')
  from unnest(array['past','draft']) k;
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  select pg_temp.id(k), 1, now() - interval '5 hours', now() - interval '3 hours', 'Door', '{"kind":"exact","min":20,"max":20}', false
  from unnest(array['past','draft']) k;
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id(k), pg_temp.id(n), 'going', 1
  from unnest(array['past','draft']) k, unnest(array['maya','a','b','c','d']) n;
insert into attendance (plan_id, user_id, attended)
  select pg_temp.id(k), pg_temp.id(n), case when n = 'd' then 'no' else 'yes' end
  from unnest(array['past','draft']) k, unnest(array['a','b','c','d']) n;

-- The bucket
select is((select count(*) from storage.buckets where id = 'album'), 1::bigint, 'The album bucket exists');
select is((select public from storage.buckets where id = 'album'), false, 'The album bucket is private');
select is((select file_size_limit from storage.buckets where id = 'album'), 15728640::bigint, 'Files are limited to 15 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'album'), array['image/jpeg']::text[], 'Files must be JPEG');

-- Upload authorization. Clients cannot write bytes directly because that would bypass server re-encoding.
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok(format('select pg_temp.upload(%L)', pg_temp.path('past', 'a', 'one')), '42501', null, 'Clients cannot bypass the album-photo function');
select ok(authorize_album_photo_upload(pg_temp.id('past')), 'a is authorized for the plan they attended');
reset role;
select lives_ok(format('select pg_temp.server_upload(%L)', pg_temp.path('past', 'a', 'one')), 'The server uploads a''s sanitized photo');
select lives_ok(format('select pg_temp.server_upload(%L)', pg_temp.path('past', 'a', 'two')), 'The server uploads a second sanitized photo');
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok(format('select pg_temp.upload(%L)', pg_temp.path('past', 'b', 'x')), '42501', null, 'a cannot upload into b''s folder');
select is(authorize_album_photo_upload(pg_temp.id('draft')), false, 'No upload to a draft plan');
select is(authorize_album_photo_upload(pg_temp.id('nope')), false, 'No upload to a plan that does not exist');
select throws_ok(format('select pg_temp.upload(%L)', replace(pg_temp.path('past', 'a', 'x'), '.jpg', '.png')), '42501', null, 'Only .jpg names');
select throws_ok(format('select pg_temp.upload(%L)', pg_temp.id('past')::text || '/' || pg_temp.id('a')::text || '/sub/x.jpg'), '42501', null, 'No nested folders');
select throws_ok($$select pg_temp.upload('past/a/x.jpg')$$, '42501', null, 'Names that are not ids are refused without a cast error');
select throws_ok(format('select pg_temp.upload(%L)', upper(pg_temp.path('past', 'a', 'x'))), '42501', null, 'Upper-case ids are refused');
select throws_ok(format($f$insert into storage.objects (id, bucket_id, name) values (gen_random_uuid(), 'album-other', %L)$f$, pg_temp.path('past', 'a', 'x')), '42501', null, 'Another bucket gets no access from the album policies');

select pg_temp.as_user('d');
select is(authorize_album_photo_upload(pg_temp.id('past')), false, 'Someone who said they did not go is not authorized');
select pg_temp.as_user('gm');
select is(authorize_album_photo_upload(pg_temp.id('past')), false, 'A group member who is not on the plan is not authorized');
select pg_temp.as_user('outsider');
select is(authorize_album_photo_upload(pg_temp.id('past')), false, 'A stranger is not authorized');
select throws_ok(format('select pg_temp.upload(%L)', pg_temp.path('past', 'a', 'y')), '42501', null, 'A stranger cannot upload into someone else''s folder either');

-- Read, plan audience
select pg_temp.as_user('a');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 1::bigint, 'a reads their own upload before it has an item');
select lives_ok(format('select add_album_item(%L, %L, %L, %L, null)', pg_temp.id('k1'), pg_temp.id('past'), 'photo', pg_temp.path('past', 'a', 'one')), 'a posts the photo');
select pg_temp.as_user('b');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 1::bigint, 'An invitee of the plan reads a plan-audience file');
select is(pg_temp.files(pg_temp.path('past', 'a', 'two')), 0::bigint, 'A file with no item is not readable by others');
select pg_temp.as_user('maya');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 1::bigint, 'The organizer reads it');
select pg_temp.as_user('gm');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 0::bigint, 'A group member who was not on the plan cannot read a plan-audience file');
select pg_temp.as_user('outsider');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 0::bigint, 'A stranger cannot read it');
select is(pg_temp.files(), 0::bigint, 'A stranger cannot list the bucket');

-- Read, group audience
select pg_temp.as_user('a');
select lives_ok(format('select share_album_item(%L)', pg_temp.item('k1')), 'a shares the photo to the group');
select pg_temp.as_user('gm');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 1::bigint, 'After sharing, a group member can read it');
select pg_temp.as_user('outsider');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 0::bigint, 'A stranger still cannot');

-- A reporter no longer sees it; others still do
select pg_temp.as_user('b');
select lives_ok(format('select report_album_item(%L)', pg_temp.item('k1')), 'b reports the photo');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 0::bigint, 'A reporter no longer opens the file');
select pg_temp.as_user('c');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 1::bigint, 'Other people still can');

-- An item cannot claim someone else's file by writing its path
select pg_temp.as_user('b');
select lives_ok(format('select add_album_item(%L, %L, %L, %L, null)', pg_temp.id('k-claim'), pg_temp.id('past'), 'photo', pg_temp.path('past', 'a', 'two')), 'b registers an item that names a''s second file');
select is(pg_temp.files(pg_temp.path('past', 'a', 'two')), 0::bigint, 'That does not let b read a''s file');
select lives_ok(format('select delete_album_item(%L)', pg_temp.item('k-claim')), 'b deletes that item');
select is(pg_temp.exists_file(pg_temp.path('past', 'a', 'two')), 1::bigint, 'Deleting it did not delete a''s file');

-- Files are not overwritten, and others cannot delete or change them
select pg_temp.as_user('c');
select lives_ok(format($f$update storage.objects set metadata = '{"x":1}' where bucket_id = 'album' and name = %L$f$, pg_temp.path('past', 'a', 'one')), 'c''s overwrite attempt is filtered');
select lives_ok(format($f$delete from storage.objects where bucket_id = 'album' and name = %L$f$, pg_temp.path('past', 'a', 'one')), 'c''s delete attempt is filtered');
select pg_temp.as_user('a');
select lives_ok(format($f$update storage.objects set metadata = '{"x":1}' where bucket_id = 'album' and name = %L$f$, pg_temp.path('past', 'a', 'one')), 'Not even the owner can change a file');
reset role;
select is(pg_temp.exists_file(pg_temp.path('past', 'a', 'one')), 1::bigint, 'The file is still there after those attempts');
select is((select metadata from storage.objects where name = pg_temp.path('past', 'a', 'one')), null::jsonb, 'And unchanged');

-- Delete by the owner, also after leaving the group
delete from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('a');
set local role authenticated;
select pg_temp.as_user('a');
select is(pg_temp.files(pg_temp.path('past', 'a', 'two')), 1::bigint, 'The owner still reads their own file after leaving the group');
select lives_ok(format($f$delete from storage.objects where bucket_id = 'album' and name = %L$f$, pg_temp.path('past', 'a', 'two')), 'The owner deletes a file after leaving the group');
reset role;
select is(pg_temp.exists_file(pg_temp.path('past', 'a', 'two')), 0::bigint, 'That file is gone');

-- Deleting the item deletes the file for everyone
set local role authenticated;
select pg_temp.as_user('a');
select lives_ok(format('select delete_album_item(%L)', pg_temp.item('k1')), 'a deletes the shared item');
reset role;
select is(pg_temp.exists_file(pg_temp.path('past', 'a', 'one')), 0::bigint, 'Its file is gone');
set local role authenticated;
select pg_temp.as_user('c');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 0::bigint, 'A group member cannot open it any more');
select pg_temp.as_user('maya');
select is(pg_temp.files(pg_temp.path('past', 'a', 'one')), 0::bigint, 'Nor the organizer');

-- Any other way an item row goes away (an account or plan cleanup) takes its file with it
select pg_temp.as_user('b');
select ok(authorize_album_photo_upload(pg_temp.id('past')), 'b is authorized for another photo');
reset role;
select lives_ok(format('select pg_temp.server_upload(%L)', pg_temp.path('past', 'b', 'cascade')), 'The server uploads b''s sanitized file');
set local role authenticated;
select pg_temp.as_user('b');
select lives_ok(format('select add_album_item(%L, %L, %L, %L, null)', pg_temp.id('k2'), pg_temp.id('past'), 'photo', pg_temp.path('past', 'b', 'cascade')), 'and posts it');
reset role;
delete from album_items where plan_id = pg_temp.id('past');
select is(pg_temp.exists_file(pg_temp.path('past', 'b', 'cascade')), 0::bigint, 'A removed item row deletes its file too');

select * from finish();
rollback;
