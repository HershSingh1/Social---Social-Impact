begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
-- A valid form, with overrides merged on top.
create function pg_temp.pl(o jsonb default '{}') returns jsonb language sql as $$
  select '{"name":"Cedar Hollow Pottery","description":"Wheel-throwing studio with open walk-in evenings.","category":"Make something",
           "address":"12 Cedar St","timing_kind":"flexible","hours_text":"Thu-Sat 5-9 p.m.","duration_min":90,
           "price_kind":"exact","price_min":30,"source":"https://example.com/cedar"}'::jsonb || o $$;
-- The field errors of a refused submission, or null when it was accepted.
create function pg_temp.errs(o text) returns jsonb language plpgsql as $$
declare d text;
begin
  perform submit_listing(gen_random_uuid(), pg_temp.pl(o::jsonb));
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d::jsonb;
end $$;
create function pg_temp.set_sub(s text, v uuid) returns uuid language sql as $$ select set_config('t.' || s, v::text, true)::uuid $$;
create function pg_temp.sub(s text) returns uuid language sql as $$ select current_setting('t.' || s)::uuid $$;
create function pg_temp.state(s text) returns text language sql as $$
  select state || ':' || coalesce(reason, '-') from submissions where id = pg_temp.sub(s) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['ann','bob','rev','nameless']) n;
update profiles set display_name = id::text where id <> pg_temp.id('nameless');
insert into private.reviewers (user_id) values (pg_temp.id('rev'));

select has_function('public', 'submit_listing', array['uuid','jsonb'], 'submit_listing exists');
select has_function('public', 'review_submission', array['uuid','text','text'], 'review_submission exists');
select has_function('public', 'report_listing', array['uuid','text'], 'report_listing exists');
select ok(not has_function_privilege('anon', 'public.submit_listing(uuid,jsonb)', 'EXECUTE'), 'Signed-out clients cannot submit');
select ok(not has_table_privilege('authenticated', 'public.submissions', 'INSERT'), 'Clients cannot write submissions directly');
select ok(not has_table_privilege('authenticated', 'private.reviewers', 'SELECT'), 'Clients cannot read the reviewer list');

set local role authenticated;
select pg_temp.as_user('ann');
select pg_temp.set_sub('s1', submit_listing(pg_temp.id('k1'), pg_temp.pl('{"evil":"x","author_id":"nope"}')));
reset role;
select is((select state from submissions where id = pg_temp.sub('s1')), 'pending', 'A new submission waits for review');
select ok(not (select payload ? 'evil' or payload ? 'author_id' from submissions where id = pg_temp.sub('s1')), 'Unknown keys are not stored');
set local role authenticated;
select pg_temp.as_user('ann');
select is(submit_listing(pg_temp.id('k1'), pg_temp.pl('{"evil":"x","author_id":"nope"}')), pg_temp.sub('s1'), 'The same key again returns the same submission');
select is((select count(*) from submissions), 1::bigint, 'One row, not two');
select throws_ok($$select submit_listing(pg_temp.id('k1'), pg_temp.pl('{"name":"Other"}'))$$, 'P0001', 'client_key_conflict', 'A reused key with another payload is refused');
select pg_temp.as_user('bob');
select throws_ok($$select submit_listing(pg_temp.id('k1'), pg_temp.pl('{"evil":"x","author_id":"nope"}'))$$, 'P0001', 'client_key_conflict', 'Another person cannot reuse the key');
select is((select count(*) from submissions), 0::bigint, 'Other people do not see the submission');
select pg_temp.as_user('rev');
select is((select count(*) from submissions), 1::bigint, 'A reviewer sees the queue');
select pg_temp.as_user('nameless');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl())$$, 'P0001', 'profile_required', 'A finished profile is required');

-- Field rules: every failing field is reported together
select pg_temp.as_user('ann');
select is(pg_temp.errs('{"name":"","description":"short","source":"ftp://x"}'),
  '{"name":"required","description":"too_short","source":"invalid"}'::jsonb, 'Three errors come back at once, so nothing typed is lost');
select is(pg_temp.errs('{"name":"' || repeat('n', 101) || '"}'), '{"name":"too_long"}'::jsonb, 'Name stops at 100');
select is(pg_temp.errs('{"description":"' || repeat('d', 2001) || '"}'), '{"description":"too_long"}'::jsonb, 'Description stops at 2000');
select is(pg_temp.errs('{"category":"Spa"}'), '{"category":"invalid"}'::jsonb, 'Category is one of the seven');
select is(pg_temp.errs('{"address":"","meeting_point":""}'), '{"location":"required"}'::jsonb, 'A location or meeting point is needed');
select is(pg_temp.errs('{"address":null,"lat":95,"lng":0}'), '{"location":"invalid"}'::jsonb, 'A map position must be real');
select is(pg_temp.errs('{"timing_kind":"fixed"}'), '{"sessions":"invalid"}'::jsonb, 'Fixed timing needs sessions');
select is(pg_temp.errs('{"timing_kind":"fixed","sessions":[{"start_local":"2026-12-05T10:00","end_local":"2026-12-05T09:00"}]}'),
  '{"sessions":"invalid"}'::jsonb, 'A session cannot end before it starts');
select is(pg_temp.errs('{"hours_text":""}'), '{"hours_text":"required"}'::jsonb, 'Flexible timing needs hours');
select is(pg_temp.errs('{"duration_min":0}'), '{"duration_min":"invalid"}'::jsonb, 'Duration is at least a minute');
select is(pg_temp.errs('{"price_kind":"exact","price_min":"cheap"}'), '{"price":"invalid"}'::jsonb, 'An exact price needs a number');
select is(pg_temp.errs('{"price_kind":"estimated","price_min":20,"price_max":10}'), '{"price":"invalid"}'::jsonb, 'Estimated max is not below min');
select is(pg_temp.errs('{"image_url":"http://x.test/a.png"}'), '{"image_url":"invalid"}'::jsonb, 'An image link must be https');
select is(pg_temp.errs('{"timing_kind":"fixed","sessions":[{"start_local":"2026-12-05T10:00","end_local":"2026-12-05T12:00"}],"price_kind":"free","image_url":"https://x.test/a.png"}'),
  null, 'A fixed-session free listing with an image is accepted');

-- Review: only reviewers
select pg_temp.as_user('bob');
select throws_ok($$select review_submission(pg_temp.sub('s1'), 'approve')$$, '42501', 'not_reviewer', 'A non-reviewer cannot review');
select pg_temp.as_user('ann');
select throws_ok($$select review_submission(pg_temp.sub('s1'), 'approve')$$, '42501', 'not_reviewer', 'Authors cannot approve their own');
select pg_temp.as_user('rev');
select throws_ok($$select review_submission(pg_temp.sub('s1'), 'maybe')$$, 'P0001', 'invalid_decision', 'Only approve, needs_changes, reject');
select throws_ok($$select review_submission(pg_temp.sub('s1'), 'needs_changes')$$, 'P0001', 'reason_required', 'Needs changes needs a reason');
select throws_ok($$select review_submission(pg_temp.sub('s1'), 'reject', '  ')$$, 'P0001', 'reason_required', 'Reject needs a reason');
select lives_ok($$select review_submission(pg_temp.sub('s1'), 'needs_changes', 'Add the studio''s hours')$$, 'Needs changes with a reason');
select lives_ok($$select review_submission(pg_temp.sub('s1'), 'needs_changes', 'Add the studio''s hours')$$, 'Deciding the same way twice does nothing');
select throws_ok($$select review_submission(pg_temp.sub('s1'), 'approve')$$, 'P0001', 'not_pending', 'A decision cannot be flipped');
select pg_temp.as_user('ann');
select is(pg_temp.state('s1'), 'needs_changes:Add the studio''s hours', 'The author sees the state and the reason');

-- Resubmit after Needs changes
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('submission_id', pg_temp.id('nope'))))$$, 'P0001', 'submission_not_found', 'Unknown submission');
select pg_temp.as_user('bob');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('submission_id', pg_temp.sub('s1'))))$$, 'P0001', 'submission_not_found', 'Someone else''s submission');
select pg_temp.as_user('ann');
select is(submit_listing(pg_temp.id('k2'), pg_temp.pl(jsonb_build_object('submission_id', pg_temp.sub('s1'), 'hours_text', 'Thu-Sat 5-9 p.m., Sun 1-5'))),
  pg_temp.sub('s1'), 'Resubmitting returns the same submission');
select is(pg_temp.state('s1'), 'pending:-', 'It is pending again with the reason cleared');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('submission_id', pg_temp.sub('s1'))))$$, 'P0001', 'not_resubmittable', 'Only Needs changes can be resubmitted');

-- Approve publishes
select pg_temp.as_user('rev');
select lives_ok($$select review_submission(pg_temp.sub('s1'), 'approve')$$, 'A reviewer approves');
select pg_temp.as_user('bob');
select is((select price_min from experiences where name = 'Cedar Hollow Pottery' and status = 'published'), 30::numeric, 'The approved listing is on the map for everyone');
select is((select hours_text from experiences where name = 'Cedar Hollow Pottery'), 'Thu-Sat 5-9 p.m., Sun 1-5', 'It carries the resubmitted text');
select is((select version from experiences where name = 'Cedar Hollow Pottery'), 1, 'Version 1');
reset role;
select is((select count(*) from experiences where name = 'Cedar Hollow Pottery'), 1::bigint, 'One listing');
select ok((select experience_id is not null from submissions where id = pg_temp.sub('s1')), 'The submission points at its listing');

-- Reject creates nothing
set local role authenticated;
select pg_temp.as_user('bob');
select pg_temp.set_sub('s2', submit_listing(pg_temp.id('k3'), pg_temp.pl('{"name":"Sketchy Place"}')));
select pg_temp.as_user('rev');
select lives_ok($$select review_submission(pg_temp.sub('s2'), 'reject', 'Duplicate of Cedar Hollow Pottery')$$, 'Reject with a reason');
reset role;
select is((select count(*) from experiences where name = 'Sketchy Place'), 0::bigint, 'A rejected suggestion is not published');

-- Editing an approved listing: the live version stays until the edit is approved
set local role authenticated;
select pg_temp.as_user('bob');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where name = 'Cedar Hollow Pottery'))))$$,
  '42501', 'not_your_listing', 'Only the author edits an approved listing');
select pg_temp.as_user('ann');
select pg_temp.set_sub('s3', submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where name = 'Cedar Hollow Pottery'), 'price_min', 45, 'name', 'Cedar Hollow Pottery Studio'))));
select is((select price_min from experiences where name = 'Cedar Hollow Pottery'), 30::numeric, 'The live listing is unchanged while the edit waits');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('experience_id', (select id from experiences where name = 'Cedar Hollow Pottery'))))$$,
  'P0001', 'edit_in_progress', 'One edit at a time');
select pg_temp.as_user('rev');
select lives_ok($$select review_submission(pg_temp.sub('s3'), 'approve')$$, 'The edit is approved');
reset role;
select is((select price_min || '/' || version from experiences where name = 'Cedar Hollow Pottery Studio'), '45/2', 'The same listing now has the new price and version 2');
select is((select count(*) from experiences where name like 'Cedar Hollow%'), 1::bigint, 'The edit did not add a second listing');

-- Reports
set local role authenticated;
select pg_temp.as_user('bob');
select lives_ok($$select report_listing((select id from experiences where name = 'Cedar Hollow Pottery Studio'), 'Closed on Sundays now')$$, 'Report outdated info');
select lives_ok($$select report_listing((select id from experiences where name = 'Cedar Hollow Pottery Studio'), 'Closed on Sundays now')$$, 'Reporting the same version again is harmless');
select throws_ok($$select report_listing((select id from experiences where name = 'Cedar Hollow Pottery Studio'), '')$$, 'P0001', 'invalid_issue', 'An issue is required');
select throws_ok($$select report_listing(pg_temp.id('missing'), 'x')$$, 'P0001', 'experience_not_found', 'Unknown listing');
select is((select count(*) from listing_reports), 0::bigint, 'Reporters cannot read the reports');
select pg_temp.as_user('rev');
select is((select count(*) from listing_reports where version = 2), 1::bigint, 'Reviewers read reports, one per person per version');

-- Limit on open suggestions
select pg_temp.as_user('ann');
create function pg_temp.fill() returns void language plpgsql as $$
begin for i in 1..9 loop perform submit_listing(gen_random_uuid(), pg_temp.pl(jsonb_build_object('name', 'Spot ' || i))); end loop; end $$;
select lives_ok($$select pg_temp.fill()$$, 'Ten open suggestions are allowed');
select throws_ok($$select submit_listing(gen_random_uuid(), pg_temp.pl('{"name":"One too many"}'))$$, 'P0001', 'too_many_open', 'An eleventh is refused');

select * from finish();
rollback;
