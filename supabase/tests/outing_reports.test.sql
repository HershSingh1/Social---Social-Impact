begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
-- Outings the group's history counts for the caller.
create function pg_temp.outings(g text) returns bigint language sql as $$
  select count(*) from group_history(pg_temp.id(g)) where counts_as_outing $$;

-- Fixture: maya organizes. a, b, c, d are Going on `past`; e is awaiting, f can't go; outsider is in no group.
-- Plans: past (ended 3h ago), recent (ended 1h ago), cancelled (cancelled, ended 3h ago), future, draft,
-- other (past, in a second group), solo (past, no group).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','e','f','outsider','nameless','z']) n;
update profiles set display_name = 'Name of ' || id::text where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk')),
  (pg_temp.id('g2'), 'G2', pg_temp.id('z'), pg_temp.id('g2k'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n)
  from unnest(array['maya','a','b','c','d','e','f']) n;
insert into group_members (group_id, user_id) values (pg_temp.id('g2'), pg_temp.id('z'));
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, source, status)
  values (pg_temp.id('e1'), 'Clay', 'art', 'exact', 20, 20, 'flexible', 'PLACEHOLDER: outing test', 'published');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  select pg_temp.id(k), case k when 'other' then pg_temp.id('g2') when 'solo' then null else pg_temp.id('g') end,
         case k when 'other' then pg_temp.id('z') else pg_temp.id('maya') end,
         pg_temp.id('e1'), 'Clay ' || k, 'art',
         case k when 'draft' then 'draft' when 'cancelled' then 'cancelled' else 'sent' end, 1, pg_temp.id(k || 'k')
  from unnest(array['past','recent','cancelled','future','draft','other','solo']) k;
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  select pg_temp.id(k), 1, now() + a, now() + b, 'Door', '{"kind":"exact","min":20,"max":20}', false
  from (values ('past', interval '-5 hours', interval '-3 hours'), ('recent', interval '-3 hours', interval '-1 hour'),
               ('cancelled', interval '-5 hours', interval '-3 hours'), ('future', interval '1 day', interval '1 day 2 hours'),
               ('draft', interval '-5 hours', interval '-3 hours'), ('other', interval '-5 hours', interval '-3 hours'),
               ('solo', interval '-5 hours', interval '-3 hours')) v(k, a, b);
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id(k), pg_temp.id(n),
         case when n in ('e') then 'awaiting' when n = 'f' then 'cant_go' else 'going' end, 1
  from unnest(array['past','recent','cancelled','future','draft','solo']) k,
       unnest(array['maya','a','b','c','d','e','f']) n;
insert into rsvps (plan_id, user_id, status, revision) values (pg_temp.id('other'), pg_temp.id('z'), 'going', 1);

select has_table('public', 'outing_reports', 'outing_reports exists');
select has_table('public', 'attendance', 'attendance exists');
select has_function('public', 'report_outing', array['uuid','text'], 'report_outing has the agreed arguments');
select has_function('public', 'report_attendance', array['uuid','text'], 'report_attendance has the agreed arguments');
select has_function('public', 'group_history', array['uuid'], 'group_history has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.report_outing(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.report_attendance(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.group_history(uuid)', 'EXECUTE'), 'Signed-out clients can call none of them');
select ok(not has_table_privilege('authenticated', 'public.outing_reports', 'INSERT')
  and not has_table_privilege('authenticated', 'public.outing_reports', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.outing_reports', 'DELETE')
  and not has_table_privilege('authenticated', 'public.attendance', 'INSERT')
  and not has_table_privilege('authenticated', 'public.attendance', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.attendance', 'DELETE'), 'Clients cannot write either table');

-- Every user id and display name, read before the role switch (RLS would show a caller only their own profile).
create temp table all_names as
  select id::text as s from profiles union select display_name from profiles where display_name is not null;
grant select on all_names to authenticated;

set local role authenticated;

-- A plan with 4 Going and no reports shows 0 attended and does not count as an outing.
select pg_temp.as_user('a');
select is((select going_count from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 5,
  'Maya, a, b, c and d are Going (5), e and f are not');
select is((select attended_count from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 0,
  'Going with no reports shows 0 attended');
select is((select you_went from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), null,
  'Silence is not stored as yes or no');
select is(pg_temp.outings('g'), 0::bigint, 'No outing counts before the organizer reports');

-- Who may report the outing
select throws_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, '42501', 'not_organizer', 'An invitee cannot report the outing');
select pg_temp.as_user('outsider');
select throws_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, '42501', 'not_organizer', 'A stranger cannot report the outing');
select pg_temp.as_user('nameless');
select throws_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, 'P0001', 'profile_required', 'A finished profile is required');
select pg_temp.as_user('maya');
select throws_ok($$select report_outing(pg_temp.id('draft'), 'happened')$$, '42501', 'not_organizer', 'A draft cannot be reported');
select throws_ok($$select report_outing(pg_temp.id('future'), 'happened')$$, 'P0001', 'too_early', 'Before the plan ends the call is refused');
select throws_ok($$select report_outing(pg_temp.id('recent'), 'happened')$$, 'P0001', 'too_early', 'Less than 2 hours after the end the call is refused');
select throws_ok($$select report_outing(pg_temp.id('cancelled'), 'happened')$$, 'P0001', 'plan_cancelled', 'A cancelled plan cannot be reported');
select throws_ok($$select report_outing(pg_temp.id('past'), 'maybe')$$, 'P0001', 'invalid_status', 'Unknown status is refused');
select throws_ok($$select report_outing(pg_temp.id('past'), null)$$, 'P0001', 'invalid_status', 'Null status is refused');
select is((select count(*) from outing_reports), 0::bigint, 'Refused calls stored nothing');

-- Happened counts; correcting to Didn't happen lowers the count by one.
select lives_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, 'Maya reports Happened');
select lives_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, 'Sending it again is accepted');
select is((select count(*) from outing_reports), 1::bigint, 'Repeating a report leaves one row');
select is(pg_temp.outings('g'), 1::bigint, 'The group has one outing');
select lives_ok($$select report_outing(pg_temp.id('past'), 'not_sure')$$, 'Maya changes to Not sure');
select is(pg_temp.outings('g'), 0::bigint, 'Not sure does not count');
select lives_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, 'Maya changes back to Happened');
select is(pg_temp.outings('g'), 1::bigint, 'Back to one outing');
select lives_ok($$select report_outing(pg_temp.id('past'), 'didnt_happen')$$, 'Maya corrects to Didn''t happen');
select is(pg_temp.outings('g'), 0::bigint, 'Correcting Happened to Didn''t happen lowers the count by one');
select is((select organizer_status from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 'didnt_happen',
  'The history shows what the organizer said');
select lives_ok($$select report_outing(pg_temp.id('past'), 'happened')$$, 'Maya sets Happened for the attendance checks');
select is((select organizer_status from outing_reports where plan_id = pg_temp.id('past')), 'happened', 'The organizer reads her own report');

-- Who may report attendance
select pg_temp.as_user('e');
select throws_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, '42501', 'not_going', 'An invitee who has not answered Going cannot report attendance');
select pg_temp.as_user('f');
select throws_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, '42501', 'not_going', 'An invitee who can''t go cannot report attendance');
select pg_temp.as_user('outsider');
select throws_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, '42501', 'not_going', 'A stranger cannot report attendance');
select pg_temp.as_user('nameless');
select throws_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, 'P0001', 'profile_required', 'A finished profile is required');
select pg_temp.as_user('a');
select throws_ok($$select report_attendance(pg_temp.id('future'), 'yes')$$, 'P0001', 'too_early', 'Before the plan ends the call is refused');
select throws_ok($$select report_attendance(pg_temp.id('recent'), 'yes')$$, 'P0001', 'too_early', 'Less than 2 hours after the end the call is refused');
select throws_ok($$select report_attendance(pg_temp.id('cancelled'), 'yes')$$, 'P0001', 'plan_cancelled', 'A cancelled plan takes no attendance');
select throws_ok($$select report_attendance(pg_temp.id('draft'), 'yes')$$, '42501', 'not_going', 'A draft takes no attendance');
select throws_ok($$select report_attendance(pg_temp.id('past'), 'skip')$$, 'P0001', 'invalid_attended', 'Skip is not stored');
select throws_ok($$select report_attendance(pg_temp.id('past'), null)$$, 'P0001', 'invalid_attended', 'Null is not stored');
select is((select count(*) from attendance), 0::bigint, 'Refused calls stored nothing');

-- Yes, No, changes, and privacy
select lives_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, 'a says yes');
select lives_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, 'Sending it again is accepted');
select is((select count(*) from attendance), 1::bigint, 'Repeating leaves one row');
select is((select you_went from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), true, 'a sees that they went');
select is((select attended_count from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 1, 'The count is 1');
select lives_ok($$select report_attendance(pg_temp.id('past'), 'no')$$, 'a changes to no');
select is((select you_went from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), false, 'a now sees that they did not go');
select is((select attended_count from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 0, 'The count follows the change');
select lives_ok($$select report_attendance(pg_temp.id('past'), 'yes')$$, 'a says yes again');
select pg_temp.as_user('b');
select lives_ok($$select report_attendance(pg_temp.id('past'), 'no')$$, 'b says no');
select is((select count(*) from attendance), 1::bigint, 'b reads only their own attendance row');
select is((select attended from attendance), 'no', 'and it is theirs');
select is((select attended_count from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 1, 'Counts only yes answers');
select is((select you_went from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), false, 'b sees their own answer');
select pg_temp.as_user('c');
select is((select count(*) from attendance), 0::bigint, 'c reads nobody else''s attendance');
select is((select you_went from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), null, 'c has not answered');
select is((select count(*) from outing_reports), 0::bigint, 'An invitee cannot read the organizer''s report row');
select pg_temp.as_user('maya');
select is((select count(*) from attendance), 0::bigint, 'The organizer cannot read anyone''s attendance');
select is((select count(*) from outing_reports), 1::bigint, 'The organizer reads the report');
select throws_ok($$insert into attendance (plan_id, user_id, attended) values (pg_temp.id('past'), pg_temp.id('maya'), 'yes')$$,
  '42501', null, 'Direct client insert is rejected');
select throws_ok($$update outing_reports set organizer_status = 'happened'$$, '42501', null, 'Direct client update is rejected');

-- group_history
select pg_temp.as_user('outsider');
select throws_ok($$select * from group_history(pg_temp.id('g'))$$, '42501', 'not_a_member', 'Only group members read the history');
select pg_temp.as_user('a');
select is((select count(*) from group_history(pg_temp.id('g'))), 3::bigint, 'Past sent plans and the cancelled one are listed; future, draft and other groups are not');
select is((select array_agg(activity_name order by activity_name) from group_history(pg_temp.id('g'))),
  array['Clay cancelled','Clay past','Clay recent'], 'Listed by name');
select is((select cancelled from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('cancelled')), true,
  'The cancelled plan is kept and marked');
select is((select counts_as_outing from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('cancelled')), false,
  'but is not an outing');
select is((select counts_as_outing from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('recent')), false,
  'An unreported plan is not an outing');
select is((select time_zone from group_history(pg_temp.id('g')) where plan_id = pg_temp.id('past')), 'America/Chicago', 'The zone comes with the date');
-- No other person's id or name appears anywhere in the output.
select cmp_ok((select count(*) from all_names), '>=', 10::bigint, 'The name check has everyone to look for');
select is((select count(*) from group_history(pg_temp.id('g')) h,
    all_names names
  where row_to_json(h)::text like '%' || names.s || '%' and names.s <> pg_temp.id('a')::text and names.s <> 'Name of ' || pg_temp.id('a')::text
    and names.s <> ''), 0::bigint, 'group_history output contains no user id or name but the caller''s own');
select is((select count(*) from group_history(pg_temp.id('g')) h
  where row_to_json(h)::text like '%' || pg_temp.id('maya')::text || '%'
     or row_to_json(h)::text like '%' || pg_temp.id('b')::text || '%'), 0::bigint, 'Maya''s and b''s ids are not in it');
select pg_temp.as_user('z');
select is((select count(*) from group_history(pg_temp.id('g2'))), 1::bigint, 'Another group sees its own history');
select throws_ok($$select * from group_history(pg_temp.id('g'))$$, '42501', 'not_a_member', 'and not this group''s');

-- Members who left no longer read the history.
reset role;
update group_members set removed_at = now() where group_id = pg_temp.id('g') and user_id = pg_temp.id('f');
set local role authenticated;
select pg_temp.as_user('f');
select throws_ok($$select * from group_history(pg_temp.id('g'))$$, '42501', 'not_a_member', 'A removed member reads nothing');

-- Deleting an account takes their attendance with them.
select pg_temp.as_user('a');
select lives_ok($$select delete_account()$$, 'a deletes their account');
reset role;
select is((select count(*) from attendance where user_id = pg_temp.id('a')), 0::bigint, 'Their attendance is gone');
select is((select count(*) from attendance), 1::bigint, 'Others stay');

select * from finish();
rollback;
