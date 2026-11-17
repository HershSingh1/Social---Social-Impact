begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan']) n;

select is((select count(*) from storage.buckets where id in ('avatars', 'listing-images')), 2::bigint,
  'Both media buckets exist');
select is((select count(*) from storage.buckets where id in ('avatars', 'listing-images') and public), 2::bigint,
  'Both media buckets serve known object URLs publicly');
select is((select count(*) from storage.buckets where id in ('avatars', 'listing-images')
  and file_size_limit = 1048576), 2::bigint, 'Both buckets limit files to 1 MiB');
select is((select count(*) from storage.buckets where id in ('avatars', 'listing-images')
  and allowed_mime_types = array['image/jpeg']::text[]), 2::bigint, 'Both buckets accept JPEG only');

set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok(format(
  'insert into storage.objects (id, bucket_id, name) values (%L, %L, %L)',
  pg_temp.id('maya-avatar'), 'avatars', pg_temp.id('maya')::text || '/avatar.jpg'
), 'Maya uploads her own avatar');
select lives_ok(format(
  'insert into storage.objects (id, bucket_id, name) values (%L, %L, %L)',
  pg_temp.id('maya-listing'), 'listing-images', pg_temp.id('maya')::text || '/listing.jpg'
), 'Maya uploads her own listing image');
select throws_ok(format(
  'insert into storage.objects (id, bucket_id, name) values (%L, %L, %L)',
  pg_temp.id('wrong-owner'), 'avatars', pg_temp.id('jordan')::text || '/avatar.jpg'
), '42501', null, 'Maya cannot upload under another user id');
select throws_ok(format(
  'insert into storage.objects (id, bucket_id, name) values (%L, %L, %L)',
  pg_temp.id('nested'), 'avatars', pg_temp.id('maya')::text || '/nested/avatar.jpg'
), '42501', null, 'Nested object paths are refused');
select throws_ok(format(
  'insert into storage.objects (id, bucket_id, name) values (%L, %L, %L)',
  pg_temp.id('png'), 'avatars', pg_temp.id('maya')::text || '/avatar.png'
), '42501', null, 'Non-JPEG object paths are refused');
select is((select count(*) from storage.objects), 2::bigint, 'Maya sees her two object rows');
select lives_ok(format(
  'update storage.objects set metadata = %L where bucket_id = %L and name = %L',
  '{"updated":true}', 'avatars', pg_temp.id('maya')::text || '/avatar.jpg'
), 'Maya can overwrite metadata for her own object');

reset role;
set local role authenticated;
select pg_temp.as_user('jordan');
select is((select count(*) from storage.objects), 0::bigint, 'Jordan cannot list Maya''s public files');
select throws_ok(format(
  'insert into storage.objects (id, bucket_id, name) values (%L, %L, %L)',
  pg_temp.id('jordan-overwrite'), 'avatars', pg_temp.id('maya')::text || '/avatar.jpg'
), '42501', null, 'Jordan cannot upload at Maya''s path');
select lives_ok(format(
  'update storage.objects set metadata = %L where bucket_id = %L and name = %L',
  '{"stolen":true}', 'avatars', pg_temp.id('maya')::text || '/avatar.jpg'
), 'An overwrite attempt is safely filtered by RLS');
select lives_ok(format(
  'delete from storage.objects where bucket_id = %L and name = %L',
  'avatars', pg_temp.id('maya')::text || '/avatar.jpg'
), 'A delete attempt is safely filtered by RLS');

reset role;
select is((select metadata ->> 'updated' from storage.objects where id = pg_temp.id('maya-avatar')), 'true',
  'Jordan did not overwrite Maya''s object');
select is((select count(*) from storage.objects where id = pg_temp.id('maya-avatar')), 1::bigint,
  'Jordan did not delete Maya''s object');

set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok(format(
  'delete from storage.objects where bucket_id = %L and name = %L',
  'avatars', pg_temp.id('maya')::text || '/avatar.jpg'
), 'Maya deletes her own avatar');
reset role;
select is((select count(*) from storage.objects where id = pg_temp.id('maya-avatar')), 0::bigint,
  'The owner delete took effect');

set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok(format(
  'select public.set_profile(%L, %L)', 'Maya', pg_temp.id('maya')::text || '/profile.jpg'
), 'set_profile accepts the caller''s avatar path');
select is((select avatar_path from profiles), pg_temp.id('maya')::text || '/profile.jpg',
  'The owned avatar path is stored');
select throws_ok(format(
  'select public.set_profile(%L, %L)', 'Maya', pg_temp.id('jordan')::text || '/profile.jpg'
), 'P0001', 'invalid_avatar_path', 'set_profile rejects another user''s path');
select throws_ok(format(
  'select public.set_profile(%L, %L)', 'Maya', pg_temp.id('maya')::text || '/nested/profile.jpg'
), 'P0001', 'invalid_avatar_path', 'set_profile rejects a nested path');
select throws_ok(format(
  'select public.set_profile(%L, %L)', 'Maya', pg_temp.id('maya')::text || '/profile.png'
), 'P0001', 'invalid_avatar_path', 'set_profile rejects a non-JPEG path');
select is((select avatar_path from profiles), pg_temp.id('maya')::text || '/profile.jpg',
  'Rejected paths do not clear the current avatar');
select lives_ok($$select public.set_profile('Maya', null)$$, 'Passing null removes the avatar path');
select is((select avatar_path from profiles), null, 'The avatar path is cleared');

select * from finish();
rollback;
