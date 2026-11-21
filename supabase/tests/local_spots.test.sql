-- TEC-141 (P2-11 backend): local spots are a kind of suggested listing, with an origin, an author and a removal path.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.pl(o jsonb default '{}') returns jsonb language sql as $$
  select '{"name":"Heron Point Overlook","description":"A quiet bend of the creek where herons nest, reached by a short dirt path.","category":"Outdoors",
           "meeting_point":"Gravel pull-off on Creek Rd","timing_kind":"flexible","hours_text":"Dawn to dusk","duration_min":60,
           "price_kind":"free","source":"https://example.com/heron"}'::jsonb || o $$;
create function pg_temp.errs(o text, k text default 'local_spot') returns jsonb language plpgsql as $$
declare d text;
begin
  perform submit_listing(gen_random_uuid(), pg_temp.pl(o::jsonb), k);
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d::jsonb;
end $$;
create function pg_temp.set_id(s text, v uuid) returns uuid language sql as $$ select set_config('t.' || s, v::text, true)::uuid $$;
create function pg_temp.get(s text) returns uuid language sql as $$ select current_setting('t.' || s)::uuid $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['ann','bob','cat','rev']) n;
update profiles set display_name = initcap(split_part(id::text, '-', 1)) where true;
update profiles set display_name = 'Ann Author' where id = pg_temp.id('ann');
insert into private.reviewers (user_id) values (pg_temp.id('rev'));
-- A catalog row the team put there directly: it must stay a catalog row.
insert into experiences (name, category, price_kind, timing_kind, source, status)
  values ('Catalog Climbing Gym', 'Active', 'exact', 'flexible', 'https://example.com/gym', 'published');

select has_function('public', 'submit_listing', array['uuid','jsonb','text'], 'submit_listing takes an optional kind');
select hasnt_function('public', 'submit_listing', array['uuid','jsonb'], 'the two-argument overload is gone, so calls stay unambiguous');
select has_function('public', 'request_local_spot_removal', array['uuid'], 'request_local_spot_removal exists');
select has_function('public', 'remove_local_spot', array['uuid'], 'remove_local_spot exists');
select ok(not has_function_privilege('anon', 'public.request_local_spot_removal(uuid)', 'EXECUTE'), 'Signed-out clients cannot ask for removal');
select ok(not has_function_privilege('anon', 'public.remove_local_spot(uuid)', 'EXECUTE'), 'Signed-out clients cannot remove');
select ok(not has_table_privilege('authenticated', 'public.local_spot_removal_requests', 'INSERT'), 'Clients cannot write removal requests directly');
select is((select origin || ':' || coalesce(added_by::text, '-') from experiences where name = 'Catalog Climbing Gym'), 'catalog:-', 'A catalog row is a catalog row with no author');

-- Kinds
set local role authenticated;
select pg_temp.as_user('ann');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(), 'event')$$, 'P0001', 'invalid_kind', 'Only listing or local_spot');
select pg_temp.set_id('plain', submit_listing(pg_temp.id('kp'), pg_temp.pl('{"name":"Plain Listing","photo_confirmed":true}')));
reset role;
select is((select kind from submissions where id = pg_temp.get('plain')), 'listing', 'The two-argument call still makes a listing');
select ok(not (select payload ? 'photo_confirmed' from submissions where id = pg_temp.get('plain')), 'A plain listing does not keep a photo confirmation');

-- A local spot: photo confirmation
set local role authenticated;
select pg_temp.as_user('ann');
select is(pg_temp.errs('{"image_url":"https://x.test/heron.jpg"}'), '{"photo_confirmed":"required"}'::jsonb, 'A photo needs the confirmation that it may be shared');
select is(pg_temp.errs('{"image_url":"https://x.test/heron.jpg","photo_confirmed":false}'), '{"photo_confirmed":"required"}'::jsonb, 'Saying no is not a confirmation');
select is(pg_temp.errs('{"image_url":"https://x.test/heron.jpg","photo_confirmed":"true"}'), '{"photo_confirmed":"required"}'::jsonb, 'Only a real true counts');
select is(pg_temp.errs('{"image_url":"https://x.test/heron.jpg","photo_confirmed":true}'), null, 'A photo with the confirmation is accepted');
select is(pg_temp.errs('{}'), null, 'A local spot with no photo needs no confirmation');
select is(pg_temp.errs('{"name":"","image_url":"https://x.test/heron.jpg"}'), '{"name":"required","photo_confirmed":"required"}'::jsonb, 'It is reported together with the other errors');
select is(pg_temp.errs('{"image_url":"https://x.test/heron.jpg"}', 'listing'), null, 'A plain listing is not asked for it');

-- Submitting
select pg_temp.set_id('spot', submit_listing(pg_temp.id('ks'), pg_temp.pl('{"image_url":"https://x.test/heron.jpg","photo_confirmed":true}'), 'local_spot'));
select is(submit_listing(pg_temp.id('ks'), pg_temp.pl('{"image_url":"https://x.test/heron.jpg","photo_confirmed":true}'), 'local_spot'), pg_temp.get('spot'), 'The same key again returns the same submission');
select throws_ok($$select submit_listing(pg_temp.id('ks'), pg_temp.pl('{"image_url":"https://x.test/heron.jpg","photo_confirmed":true}'))$$, 'P0001', 'client_key_conflict', 'The same key as a listing is a different request');
reset role;
select is((select kind || ':' || state from submissions where id = pg_temp.get('spot')), 'local_spot:pending', 'It waits for review like any suggestion');
select ok((select (payload -> 'photo_confirmed') = 'true'::jsonb from submissions where id = pg_temp.get('spot')), 'The confirmation is kept with the submission');
select is((select count(*) from experiences where name = 'Heron Point Overlook'), 0::bigint, 'Nothing is on the map before approval');

-- Pending: nobody sees the author, nobody but the reviewers sees the submission
set local role authenticated;
select pg_temp.as_user('bob');
select is((select count(*) from submissions), 0::bigint, 'Others do not see a pending spot');
select is((select count(*) from get_profile_cards(array[pg_temp.id('ann')])), 0::bigint, 'A stranger does not get the author''s card yet');
select throws_ok($$select review_submission(pg_temp.get('spot'), 'approve')$$, '42501', 'not_reviewer', 'A non-reviewer cannot approve');
select pg_temp.as_user('ann');
select throws_ok($$select review_submission(pg_temp.get('spot'), 'approve')$$, '42501', 'not_reviewer', 'Neither can the author');

-- Approval
select pg_temp.as_user('rev');
select lives_ok($$select review_submission(pg_temp.get('spot'), 'approve')$$, 'A reviewer approves it');
select pg_temp.as_user('bob');
select is((select origin || ':' || added_by::text from experiences where name = 'Heron Point Overlook'),
  'local_spot:' || pg_temp.id('ann')::text, 'Everyone can read it, with its origin and author');
select is((select status from experiences where name = 'Heron Point Overlook'), 'published', 'It is on the map');
select pg_temp.set_id('spot_exp', (select id from experiences where origin = 'local_spot'));
select is((select display_name from get_profile_cards(array[pg_temp.id('ann')])), 'Ann Author', 'A stranger gets the author''s name for the label');
select is((select count(*) from get_profile_cards(array[pg_temp.id('cat')])), 0::bigint, 'Nobody else gains visibility');
select is((select count(*) from experiences where origin = 'local_spot'), 1::bigint, 'The Local spots filter finds one');
select is((select count(*) from experiences where origin = 'catalog'), 1::bigint, 'The catalog row is unaffected');
select lives_ok($$select report_listing((select id from experiences where origin = 'local_spot'), 'The path is closed')$$, 'Reports work as on any listing');
reset role;
select is((select origin from experiences where name = 'Plain Listing'), null, 'A plain listing is not approved yet');
set local role authenticated;
select pg_temp.as_user('rev');
select review_submission(pg_temp.get('plain'), 'approve');
reset role;
select is((select origin || ':' || coalesce(added_by::text, '-') from experiences where name = 'Plain Listing'), 'catalog:-', 'An approved plain listing stays a catalog row');

-- Rejected never appears
set local role authenticated;
select pg_temp.as_user('cat');
select pg_temp.set_id('bad', submit_listing(pg_temp.id('kb'), pg_temp.pl('{"name":"Not A Spot"}'), 'local_spot'));
select pg_temp.as_user('rev');
select lives_ok($$select review_submission(pg_temp.get('bad'), 'reject', 'Private property')$$, 'A reviewer rejects it');
reset role;
select is((select count(*) from experiences where name = 'Not A Spot'), 0::bigint, 'A rejected spot never appears');
set local role authenticated;
select pg_temp.as_user('bob');
select is((select count(*) from get_profile_cards(array[pg_temp.id('cat')])), 0::bigint, 'Its author is not exposed either');

-- Editing a local spot
select pg_temp.as_user('bob');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where origin = 'local_spot'))), 'local_spot')$$,
  '42501', 'not_your_listing', 'Only the author edits it');
select pg_temp.as_user('ann');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where origin = 'local_spot'))))$$,
  'P0001', 'kind_mismatch', 'A local spot is not edited as a catalog listing');
select pg_temp.set_id('edit', submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where origin = 'local_spot'),
  'description', 'A quiet bend of the creek where herons nest. New: a bench by the water.', 'image_url', 'https://x.test/heron.jpg', 'photo_confirmed', true)), 'local_spot'));
select is((select description from experiences where origin = 'local_spot'), 'A quiet bend of the creek where herons nest, reached by a short dirt path.', 'The live spot is unchanged while the edit waits');
select pg_temp.as_user('rev');
select lives_ok($$select review_submission(pg_temp.get('edit'), 'approve')$$, 'The edit is approved');
select pg_temp.as_user('bob');
select is((select version || ':' || origin || ':' || added_by::text from experiences where origin = 'local_spot'), '2:local_spot:' || pg_temp.id('ann')::text, 'A new version, still a local spot by the same author');

-- Asking for removal, and removing
select throws_ok($$select request_local_spot_removal((select id from experiences where origin = 'local_spot'))$$, '42501', 'not_your_listing', 'Only the author can ask');
select pg_temp.as_user('ann');
select throws_ok($$select request_local_spot_removal((select id from experiences where name = 'Plain Listing'))$$, '42501', 'not_your_listing', 'A catalog listing cannot be removed this way');
select lives_ok($$select request_local_spot_removal((select id from experiences where origin = 'local_spot'))$$, 'The author asks for removal');
select lives_ok($$select request_local_spot_removal((select id from experiences where origin = 'local_spot'))$$, 'Asking again is fine');
select is((select count(*) from local_spot_removal_requests), 1::bigint, 'One request, not two');
select pg_temp.as_user('bob');
select is((select count(*) from local_spot_removal_requests), 0::bigint, 'Others do not see requests');
select throws_ok($$select remove_local_spot((select id from experiences where origin = 'local_spot'))$$, '42501', 'not_reviewer', 'A non-reviewer cannot remove');
select pg_temp.as_user('ann');
select throws_ok($$select remove_local_spot((select id from experiences where origin = 'local_spot'))$$, '42501', 'not_reviewer', 'The author asks; a reviewer removes');
select pg_temp.set_id('pending_edit', submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where origin = 'local_spot'), 'name', 'Heron Point Overlook (Renamed)')), 'local_spot'));
select pg_temp.as_user('rev');
select is((select count(*) from local_spot_removal_requests), 1::bigint, 'A reviewer sees the request');
select throws_ok($$select remove_local_spot((select id from experiences where name = 'Catalog Climbing Gym'))$$, 'P0001', 'not_local_spot', 'A reviewer cannot remove a catalog row this way');
select lives_ok($$select remove_local_spot((select id from experiences where origin = 'local_spot'))$$, 'A reviewer removes it');
select lives_ok($$select remove_local_spot(pg_temp.get('spot_exp'))$$, 'Removing twice changes nothing');
reset role;
select is((select status from experiences where origin = 'local_spot'), 'removed', 'It is off the map, and its row is kept for plans that point at it');
select is((select state || ':' || reason from submissions where id = pg_temp.get('pending_edit')), 'rejected:This spot was removed.', 'An edit that was waiting is closed with the reason');
select is((select count(*) from local_spot_removal_requests), 0::bigint, 'The request is cleared');
set local role authenticated;
select pg_temp.as_user('bob');
select is((select count(*) from experiences where origin = 'local_spot'), 0::bigint, 'Nobody sees a removed spot');
select is((select count(*) from get_profile_cards(array[pg_temp.id('ann')])), 0::bigint, 'The author''s card goes with it');
select throws_ok($$select report_listing(pg_temp.get('spot_exp'), 'x')$$, 'P0001', 'experience_not_found', 'A removed spot cannot be reported');
select pg_temp.as_user('ann');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', pg_temp.get('spot_exp'))), 'local_spot')$$,
  '42501', 'not_your_listing', 'A removed spot cannot be edited');

-- Resubmitting keeps the kind
select pg_temp.as_user('cat');
select pg_temp.set_id('nc', submit_listing(pg_temp.id('knc'), pg_temp.pl('{"name":"Needs Work Spot"}'), 'local_spot'));
select pg_temp.as_user('rev');
select review_submission(pg_temp.get('nc'), 'needs_changes', 'Add a clearer meeting point');
select pg_temp.as_user('cat');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('submission_id', pg_temp.get('nc'))))$$, 'P0001', 'kind_mismatch', 'A local spot is resubmitted as a local spot');
select lives_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('submission_id', pg_temp.get('nc'))), 'local_spot')$$, 'And that works');
reset role;

-- Deleting the author's account leaves an approved spot on the map with the author cleared
set local role authenticated;
select pg_temp.as_user('cat');
select pg_temp.set_id('cs', submit_listing(pg_temp.id('kcs'), pg_temp.pl('{"name":"Cat''s Courtyard"}'), 'local_spot'));
select pg_temp.as_user('rev');
select review_submission(pg_temp.get('cs'), 'approve');
select pg_temp.as_user('cat');
select lives_ok($$select delete_account()$$, 'An author with an approved local spot can delete their account');
reset role;
select is((select status || ':' || coalesce(added_by::text, '-') || ':' || origin from experiences where name = 'Cat''s Courtyard'), 'published:-:local_spot', 'The spot stays, with no author');
select is((select count(*) from submissions where author_id is null and state = 'approved'), 1::bigint, 'Its approved submission stays with the author cleared');

select * from finish();
rollback;
