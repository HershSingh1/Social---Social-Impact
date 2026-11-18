begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

-- Fixture: maya organizes plan `past` (ended 5h ago) for group g. a, b, c, d went; e is Going but said No;
-- f is Going and has not answered; h can't go. `outsider` is in no group. `other` is a plan in a second group.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','e','f','h','outsider','z','nameless']) n;
update profiles set display_name = 'Name of ' || id::text where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk')),
  (pg_temp.id('g2'), 'G2', pg_temp.id('z'), pg_temp.id('g2k'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n)
  from unnest(array['maya','a','b','c','d','e','f','h']) n;
insert into group_members (group_id, user_id) values (pg_temp.id('g2'), pg_temp.id('z'));
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, source, status)
  values (pg_temp.id('e1'), 'Clay', 'art', 'exact', 20, 20, 'flexible', 'PLACEHOLDER: feedback test', 'published');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  select pg_temp.id(k), case k when 'other' then pg_temp.id('g2') else pg_temp.id('g') end,
         case k when 'other' then pg_temp.id('z') else pg_temp.id('maya') end,
         pg_temp.id('e1'), 'Clay ' || k, 'art',
         case k when 'draft' then 'draft' when 'cancelled' then 'cancelled' else 'sent' end, 1, pg_temp.id(k || 'k')
  from unnest(array['past','cancelled','draft','other']) k;
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  select pg_temp.id(k), 1, now() - interval '7 hours', now() - interval '5 hours', 'Door', '{"kind":"exact","min":20,"max":20}', false
  from unnest(array['past','cancelled','draft','other']) k;
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id(k), pg_temp.id(n), case when n = 'h' then 'cant_go' else 'going' end, 1
  from unnest(array['past','cancelled','draft']) k, unnest(array['maya','a','b','c','d','e','f','h']) n;
insert into rsvps (plan_id, user_id, status, revision) values (pg_temp.id('other'), pg_temp.id('z'), 'going', 1);
insert into attendance (plan_id, user_id, attended)
  select pg_temp.id('past'), pg_temp.id(n), case when n = 'e' then 'no' else 'yes' end
  from unnest(array['maya','a','b','c','d','e']) n;
insert into attendance (plan_id, user_id, attended) values (pg_temp.id('cancelled'), pg_temp.id('a'), 'yes');
insert into attendance (plan_id, user_id, attended) values (pg_temp.id('draft'), pg_temp.id('a'), 'yes');

select has_table('public', 'feedback', 'feedback exists');
select has_table('public', 'preferences', 'preferences exists');
select has_function('public', 'set_feedback', array['uuid','text','text[]','text','boolean'], 'set_feedback has the agreed arguments');
select has_function('public', 'delete_feedback', array['uuid'], 'delete_feedback has the agreed arguments');
select has_function('public', 'set_preferences', array['text[]','text[]','text'], 'set_preferences exists');
select has_function('public', 'clear_preferences', array[]::text[], 'clear_preferences has no arguments');
select has_function('public', 'feedback_summary', array['uuid'], 'feedback_summary has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.set_feedback(uuid,text,text[],text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.delete_feedback(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_preferences(text[],text[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.clear_preferences()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.feedback_summary(uuid)', 'EXECUTE'), 'Signed-out clients can call none of them');
select ok(not has_table_privilege('authenticated', 'public.feedback', 'INSERT')
  and not has_table_privilege('authenticated', 'public.feedback', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.feedback', 'DELETE')
  and not has_table_privilege('authenticated', 'public.preferences', 'INSERT')
  and not has_table_privilege('authenticated', 'public.preferences', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.preferences', 'DELETE'), 'Clients cannot write either table');
select ok(not has_table_privilege('anon', 'public.feedback', 'SELECT') and not has_table_privilege('anon', 'public.preferences', 'SELECT'),
  'Signed-out clients read neither table');
select ok((select relrowsecurity from pg_class where oid = 'public.feedback'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.preferences'::regclass), 'RLS is on for both tables');

-- Table checks, as the owner of the database (no RLS in the way).
select throws_ok($$insert into feedback (plan_id, user_id, rating, tags) values (pg_temp.id('past'), pg_temp.id('a'), 'maybe', '{"Too cheap"}')$$,
  '23514', null, 'A tag outside the four is rejected by the table');
select throws_ok($$insert into feedback (plan_id, user_id, rating, reason) values (pg_temp.id('past'), pg_temp.id('a'), 'maybe', repeat('x', 501))$$,
  '23514', null, 'A reason over 500 characters is rejected by the table');
select throws_ok($$insert into feedback (plan_id, user_id, rating) values (pg_temp.id('past'), pg_temp.id('a'), 'great')$$,
  '23514', null, 'A rating outside the three is rejected by the table');

-- Every user id and display name, read before the role switch (RLS would show a caller only their own profile).
create temp table all_names as
  select id::text as s from profiles union select display_name from profiles where display_name is not null;
grant select on all_names to authenticated;
-- Words that appear only in reasons, so a leak is easy to spot.
create temp table secrets (s text);
insert into secrets values ('SECRET-A-REASON'), ('SECRET-B-REASON'), ('SECRET-C-REASON'), ('SECRET-D-REASON'), ('SECRET-MAYA-NEEDS');
grant select on secrets to authenticated;

set local role authenticated;

-- Who may leave feedback
select pg_temp.as_user('a');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', array['Great for groups'], 'SECRET-A-REASON', false)$$,
  'Someone who reported they went can rate');
select pg_temp.as_user('e');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'Someone who said they did not go cannot rate');
select pg_temp.as_user('f');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'Going without reporting attendance cannot rate');
select pg_temp.as_user('h');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'Someone who can''t go cannot rate');
select pg_temp.as_user('outsider');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'A stranger cannot rate');
select pg_temp.as_user('maya');
select throws_ok($$select set_feedback(pg_temp.id('other'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'Someone not on that plan cannot rate it');
select throws_ok($$select set_feedback(pg_temp.id('draft'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'A draft takes no feedback');
select throws_ok($$select set_feedback(gen_random_uuid(), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'An unknown plan gives the same error');
select pg_temp.as_user('a');
select throws_ok($$select set_feedback(pg_temp.id('cancelled'), 'maybe', '{}', null, true)$$, 'P0001', 'plan_cancelled', 'A cancelled plan takes no feedback');
select pg_temp.as_user('nameless');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, 'P0001', 'profile_required', 'A finished profile is required');
set local role anon;
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', null, 'Signed-out calls are refused');
select throws_ok($$select * from feedback$$, '42501', null, 'Signed-out clients cannot read the table');
set local role authenticated;

-- Input checks
select pg_temp.as_user('a');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'great', '{}', null, false)$$, 'P0001', 'invalid_rating', 'Unknown rating is refused');
select throws_ok($$select set_feedback(pg_temp.id('past'), null, '{}', null, false)$$, 'P0001', 'invalid_rating', 'Null rating is refused');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', array['Too cheap'], null, false)$$, 'P0001', 'invalid_tags', 'A tag outside the four is refused');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', repeat('x', 501), false)$$, 'P0001', 'reason_too_long', 'A reason over 500 characters is refused');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', repeat('x', 500), false)$$, 'A 500 character reason is allowed');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, null)$$, 'P0001', 'invalid_shared', 'Shared must be yes or no');
select is((select rating from feedback where plan_id = pg_temp.id('past')), 'maybe', 'Refused calls changed nothing, the last good one stands');

-- Retry-safe: same call twice is one row; tags are stored once, in screen order; blank reason is none.
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', array['Bad timing', 'Too far', 'Too far'], '  SECRET-A-REASON  ', false)$$, 'First call');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', array['Bad timing', 'Too far', 'Too far'], '  SECRET-A-REASON  ', false)$$, 'The retry');
select is((select count(*) from feedback where user_id = pg_temp.id('a')), 1::bigint, 'A retry is still one row');
select is((select tags from feedback where plan_id = pg_temp.id('past')), array['Too far', 'Bad timing'], 'Tags are de-duplicated and in list order');
select is((select reason from feedback where plan_id = pg_temp.id('past')), 'SECRET-A-REASON', 'The reason is trimmed');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', null, '   ', false)$$, 'Null tags and a blank reason are fine');
select is((select tags from feedback where plan_id = pg_temp.id('past')), '{}'::text[], 'Null tags store as none');
select is((select reason from feedback where plan_id = pg_temp.id('past')), null, 'A blank reason stores as none');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', array['Great for groups'], 'SECRET-A-REASON', false)$$, 'a restores their private feedback');

-- Nobody reads the summary of a plan they have no part in
select pg_temp.as_user('outsider');
select throws_ok($$select * from feedback_summary(pg_temp.id('past'))$$, '42501', 'no_access', 'A stranger reads no summary');
select pg_temp.as_user('z');
select throws_ok($$select * from feedback_summary(pg_temp.id('past'))$$, '42501', 'no_access', 'A member of another group reads no summary');
select pg_temp.as_user('maya');
select throws_ok($$select * from feedback_summary(pg_temp.id('draft'))$$, '42501', 'no_access', 'A draft has no summary');
select throws_ok($$select * from feedback_summary(gen_random_uuid())$$, '42501', 'no_access', 'An unknown plan has no summary');

-- Everyone else writes theirs: b shares, c keeps private, d shares.
select pg_temp.as_user('b');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', array['Too pricey'], 'SECRET-B-REASON', true)$$, 'b shares would do again');
select pg_temp.as_user('c');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'not_for_me', array['Too far'], 'SECRET-C-REASON', false)$$, 'c keeps not for me private');
select pg_temp.as_user('d');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', 'SECRET-D-REASON', true)$$, 'd shares maybe');

-- THE POINT: private feedback is returned to nobody but its author.
-- Every table row a caller can read through RLS:
select pg_temp.as_user('maya');
select is((select count(*) from feedback), 0::bigint, 'Maya reads no feedback rows, not even the organizer');
select pg_temp.as_user('f');
select is((select count(*) from feedback), 0::bigint, 'A Going invitee who did not report reads no rows');
select pg_temp.as_user('outsider');
select is((select count(*) from feedback), 0::bigint, 'A stranger reads no rows');
select pg_temp.as_user('c');
select is((select count(*) from feedback), 1::bigint, 'c reads only their own row');
select is((select user_id from feedback), pg_temp.id('c'), 'and it is theirs');
select is((select rating from feedback), 'not_for_me', 'with what they wrote');
-- Even b and d's shared rows are theirs alone; sharing only feeds the counts.
select pg_temp.as_user('a');
select is((select count(*) from feedback where user_id <> pg_temp.id('a')), 0::bigint, 'a cannot read b''s or d''s shared rows either');
select is((select count(*) from feedback), 1::bigint, 'a reads only their own row');

-- The summary, as each kind of reader, counts shared rows only: b (would do again) and d (maybe). a and c are private.
select pg_temp.as_user('maya');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 2, 'Two people shared');
select is((select would_do_again from feedback_summary(pg_temp.id('past'))), 1, 'one would do again');
select is((select maybe from feedback_summary(pg_temp.id('past'))), 1, 'one maybe');
select is((select not_for_me from feedback_summary(pg_temp.id('past'))), 0, 'and c''s private not for me is not in it');
select pg_temp.as_user('h');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 2, 'An invitee who could not go reads the same summary');
select pg_temp.as_user('a');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 2, 'The author of private feedback sees it is not counted');
select pg_temp.as_user('c');
select is((select not_for_me from feedback_summary(pg_temp.id('past'))), 0, 'Even c''s own private answer is not counted');
-- A group member who was never invited to the plan reads the summary through the group.
reset role;
insert into group_members (group_id, user_id) values (pg_temp.id('g'), pg_temp.id('outsider'));
set local role authenticated;
select pg_temp.as_user('outsider');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 2, 'A group member who was not invited reads the summary');
select is((select count(*) from feedback), 0::bigint, 'and still no rows');

-- No function result carries a user id, a display name, a tag or a reason.
select pg_temp.as_user('maya');
select is((select count(*) from all_names n where (select to_jsonb(t)::text from feedback_summary(pg_temp.id('past')) t) like '%' || n.s || '%'),
  0::bigint, 'The summary names nobody');
select is((select count(*) from secrets x where (select to_jsonb(t)::text from feedback_summary(pg_temp.id('past')) t) like '%' || x.s || '%'),
  0::bigint, 'The summary carries no reason');
select is((select string_agg(t, ',') from unnest((select proargnames from pg_proc where proname = 'feedback_summary')) t),
  'plan_id,shared_count,would_do_again,maybe,not_for_me', 'The summary''s result columns are counts only');
-- Nothing else returns feedback: group history carries no ratings, tags or reasons.
select is((select count(*) from secrets x where (select coalesce(jsonb_agg(to_jsonb(h)), '[]')::text from group_history(pg_temp.id('g')) h) like '%' || x.s || '%'),
  0::bigint, 'group_history carries no reason');
select is((select count(*) from secrets x where (select coalesce(jsonb_agg(to_jsonb(h)), '[]')::text from group_history(pg_temp.id('g')) h) like '%not_for_me%'),
  0::bigint, 'group_history carries no rating');

-- Sharing and un-sharing change the summary. c shares: 3 shared, with not_for_me 1.
select pg_temp.as_user('c');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'not_for_me', array['Too far'], 'SECRET-C-REASON', true)$$, 'c shares');
select pg_temp.as_user('maya');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 3, 'Sharing adds c to the count');
select is((select not_for_me from feedback_summary(pg_temp.id('past'))), 1, 'and to not for me');
-- b changes their mind about sharing.
select pg_temp.as_user('b');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', array['Too pricey'], 'SECRET-B-REASON', false)$$, 'b un-shares');
select pg_temp.as_user('maya');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 2, 'Un-sharing removes b from the count');
select is((select would_do_again from feedback_summary(pg_temp.id('past'))), 0, 'and from would do again');
-- a shares, changing their rating at the same time.
select pg_temp.as_user('a');
select lives_ok($$select set_feedback(pg_temp.id('past'), 'would_do_again', '{}', null, true)$$, 'a shares');
select pg_temp.as_user('maya');
select row_eq($$select shared_count, would_do_again, maybe, not_for_me from feedback_summary(pg_temp.id('past'))$$,
  row(3, 1, 1, 1), 'The three shared answers split 1, 1, 1');

-- Delete feedback: only your own; deleting nothing is fine; the summary follows.
select pg_temp.as_user('d');
select lives_ok($$select delete_feedback(pg_temp.id('past'))$$, 'd deletes their feedback');
select is((select count(*) from feedback), 0::bigint, 'd has none left');
select lives_ok($$select delete_feedback(pg_temp.id('past'))$$, 'deleting again is not an error');
select pg_temp.as_user('outsider');
select lives_ok($$select delete_feedback(pg_temp.id('past'))$$, 'Deleting someone else''s plan feedback does nothing');
reset role;
select is((select count(*) from feedback where plan_id = pg_temp.id('past')), 3::bigint, 'and took nobody else''s row');
set local role authenticated;
select pg_temp.as_user('maya');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 2, 'The summary drops deleted feedback');

-- Attendance flips to No, or the person leaves the plan: their shared answer leaves the counts too.
reset role;
update attendance set attended = 'no' where plan_id = pg_temp.id('past') and user_id = pg_temp.id('a');
set local role authenticated;
select pg_temp.as_user('maya');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 1, 'Someone who now says they did not go is not counted');
select pg_temp.as_user('a');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'and cannot change feedback either');
reset role;
update rsvps set removed_at = now() where plan_id = pg_temp.id('past') and user_id = pg_temp.id('c');
set local role authenticated;
select pg_temp.as_user('maya');
select is((select shared_count from feedback_summary(pg_temp.id('past'))), 0, 'A removed invitee is not counted');
select pg_temp.as_user('c');
select throws_ok($$select set_feedback(pg_temp.id('past'), 'maybe', '{}', null, true)$$, '42501', 'not_attended', 'A removed invitee cannot rate');

-- A person removed from the group still has no access to the summary.
reset role;
update group_members set removed_at = now() where group_id = pg_temp.id('g') and user_id = pg_temp.id('outsider');
set local role authenticated;
select pg_temp.as_user('outsider');
select throws_ok($$select * from feedback_summary(pg_temp.id('past'))$$, '42501', 'no_access', 'A removed group member reads no summary');

-- Preferences: private, editable, removable
select pg_temp.as_user('maya');
select lives_ok($$select set_preferences(array['sat', 'fri', 'fri'], array['evening', 'morning'], '  SECRET-MAYA-NEEDS  ')$$, 'Maya sets preferences');
select is((select preferred_days from preferences), array['fri', 'sat'], 'Days are stored once, in week order');
select is((select preferred_times from preferences), array['morning', 'evening'], 'Times are in day order');
select is((select accessibility_needs from preferences), 'SECRET-MAYA-NEEDS', 'Needs are trimmed');
select lives_ok($$select set_preferences(array['fri', 'sat'], array['morning', 'evening'], 'SECRET-MAYA-NEEDS')$$, 'The same call again is fine');
select is((select count(*) from preferences), 1::bigint, 'It is still one row');
select pg_temp.as_user('a');
select is((select count(*) from preferences), 0::bigint, 'Another user cannot read Maya''s preferences');
select is((select count(*) from preferences where user_id = pg_temp.id('maya')), 0::bigint, 'not even by asking for her id');
select pg_temp.as_user('outsider');
select is((select count(*) from preferences), 0::bigint, 'A stranger cannot either');
select pg_temp.as_user('a');
select lives_ok($$select set_preferences('{}', '{}', null)$$, 'a sets empty preferences');
select lives_ok($$select clear_preferences()$$, 'a clears them');
select is((select count(*) from preferences), 0::bigint, 'a has none');
reset role;
select is((select count(*) from preferences where user_id = pg_temp.id('maya')), 1::bigint, 'a''s set and clear never touched Maya''s row');
set local role authenticated;
-- Nothing a function returns carries Maya's needs to others: no function returns preferences at all.
select pg_temp.as_user('a');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like '%preferences%' and p.prorettype <> 'void'::regtype), 0::bigint,
  'No function returns preferences, so there is nothing to leak through one');
select pg_temp.as_user('maya');
select lives_ok($$select clear_preferences()$$, 'Maya clears hers');
select is((select count(*) from preferences), 0::bigint, 'and they are gone');
select lives_ok($$select clear_preferences()$$, 'Clearing nothing is fine');

-- Preference checks
select throws_ok($$select set_preferences(array['funday'], '{}', null)$$, 'P0001', 'invalid_days', 'An unknown day is refused');
select throws_ok($$select set_preferences('{}', array['noon'], null)$$, 'P0001', 'invalid_times', 'An unknown time is refused');
select throws_ok($$select set_preferences('{}', '{}', repeat('x', 301))$$, 'P0001', 'needs_too_long', 'Needs over 300 characters are refused');
select lives_ok($$select set_preferences(null, null, '   ')$$, 'Null lists and blank needs store as empty');
select row_eq($$select preferred_days, preferred_times, accessibility_needs from preferences$$,
  row('{}'::text[], '{}'::text[], null::text), 'with no days, no times and no needs');
select pg_temp.as_user('nameless');
select throws_ok($$select set_preferences('{}', '{}', null)$$, 'P0001', 'profile_required', 'A finished profile is required for preferences');
select throws_ok($$select clear_preferences()$$, 'P0001', 'profile_required', 'and to clear them');
select throws_ok($$select delete_feedback(pg_temp.id('past'))$$, 'P0001', 'profile_required', 'and to delete feedback');
set local role anon;
select throws_ok($$select feedback_summary(pg_temp.id('past'))$$, '42501', null, 'Signed-out calls cannot read the summary');
set local role authenticated;

-- Deleting an account takes feedback and preferences with it.
select pg_temp.as_user('b');
select lives_ok($$select set_preferences(array['mon'], '{}', null)$$, 'b sets a preference');
select lives_ok($$select delete_account()$$, 'b deletes their account');
reset role;
select is((select count(*) from feedback where user_id = pg_temp.id('b')), 0::bigint, 'Their feedback is gone');
select is((select count(*) from preferences where user_id = pg_temp.id('b')), 0::bigint, 'Their preferences are gone');
select is((select count(*) from feedback where plan_id = pg_temp.id('past')), 2::bigint, 'Others'' feedback stays');

select * from finish();
rollback;
