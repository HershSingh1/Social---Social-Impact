begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.counts(p text) returns text language sql as $$
  select going || '/' || awaiting || '/' || cant_go || '/' || needs_reconfirm from private.rsvp_counts(pg_temp.id(p)) $$;
create function pg_temp.state(p text) returns text language sql as $$
  select state || ':' || coalesce(cancel_reason, '-') from plans where id = pg_temp.id(p) $$;

-- Fixture: maya organizes. a is going, b awaiting; outsider is in the group but not invited; nameless has no profile.
-- Plans: p1..p5 (sent, in two days), pd (draft), pu (under way), pe (ended), pl (sent, for the listing job).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','outsider','nameless']) n;
update profiles set display_name = id::text where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n) from unnest(array['maya','a','b','outsider']) n;
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, source, status)
  values (pg_temp.id('e'), 'Clay', 'art', 'exact', 20, 20, 'flexible', 'PLACEHOLDER: cancel test', 'published');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  select pg_temp.id(k), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('e'), 'Clay', 'art',
         case k when 'pd' then 'draft' else 'sent' end, 1, pg_temp.id(k || 'k')
  from unnest(array['p1','p2','p3','p4','p5','pd','pu','pe','pl']) k;
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  select pg_temp.id(k), 1, now() + a, now() + b, 'Door', '{"kind":"exact","min":20,"max":20}', false
  from (values ('p1', interval '2 days', interval '2 days 2 hours'), ('p2', interval '2 days', interval '2 days 2 hours'),
               ('p3', interval '2 days', interval '2 days 2 hours'), ('p4', interval '2 days', interval '2 days 2 hours'),
               ('p5', interval '2 days', interval '2 days 2 hours'), ('pd', interval '2 days', interval '2 days 2 hours'),
               ('pu', interval '-1 hour', interval '1 hour'), ('pe', interval '-3 hours', interval '-1 hour'),
               ('pl', interval '2 days', interval '2 days 2 hours')) v(k, a, b);
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id(k), pg_temp.id(n), case n when 'maya' then 'going' when 'a' then 'going' else 'awaiting' end, 1
  from unnest(array['p1','p2','p3','p4','p5','pd','pu','pe','pl']) k, unnest(array['maya','a','b']) n;

select has_function('public', 'cancel_plan', array['uuid','text'], 'cancel_plan has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.cancel_plan(uuid,text)', 'EXECUTE'), 'Signed-out clients cannot cancel');
select ok((select prosrc from pg_proc where proname = 'cancel_plan') ~* 'for update',
  'cancel_plan locks the plan row, the same lock respond and edit_plan take');

set local role authenticated;
-- Who may cancel
select pg_temp.as_user('a');
select throws_ok($$select cancel_plan(pg_temp.id('p1'), 'Weather')$$, '42501', 'not_organizer', 'An invitee cannot cancel');
select pg_temp.as_user('outsider');
select throws_ok($$select cancel_plan(pg_temp.id('p1'), 'Weather')$$, '42501', 'not_organizer', 'A group member who is not the organizer cannot cancel');
select pg_temp.as_user('nameless');
select throws_ok($$select cancel_plan(pg_temp.id('p1'), 'Weather')$$, 'P0001', 'profile_required', 'A finished profile is required');
select pg_temp.as_user('maya');
select throws_ok($$select cancel_plan(pg_temp.id('pd'), 'Weather')$$, '42501', 'not_organizer', 'A draft is discarded, not cancelled');
select throws_ok($$select cancel_plan(pg_temp.id('nope'), 'Weather')$$, '42501', 'not_organizer', 'An unknown plan gives the same error');
select throws_ok($$select cancel_plan(pg_temp.id('pe'), 'Weather')$$, 'P0001', 'plan_ended', 'A plan that has ended cannot be cancelled');

-- Reasons
select throws_ok($$select cancel_plan(pg_temp.id('p1'), null)$$, 'P0001', 'invalid_reason', 'A reason is required');
select throws_ok($$select cancel_plan(pg_temp.id('p1'), '   ')$$, 'P0001', 'invalid_reason', 'A blank reason is refused');
select throws_ok($$select cancel_plan(pg_temp.id('p1'), 'Other')$$, 'P0001', 'invalid_reason', 'Other needs text');
select throws_ok($$select cancel_plan(pg_temp.id('p1'), repeat('x', 201))$$, 'P0001', 'invalid_reason', 'Other text stops at 200 characters');
select is(pg_temp.state('p1'), 'sent:-', 'Refused attempts leave the plan sent');

select lives_ok($$select cancel_plan(pg_temp.id('p1'), 'weather')$$, 'Weather, in any capitalisation');
select lives_ok($$select cancel_plan(pg_temp.id('p2'), ' Not enough people ')$$, 'Not enough people');
select lives_ok($$select cancel_plan(pg_temp.id('p3'), 'VENUE CLOSED')$$, 'Venue closed');
select lives_ok($$select cancel_plan(pg_temp.id('p4'), 'Maya is sick')$$, 'Other with text');
select lives_ok($$select cancel_plan(pg_temp.id('pu'), 'Weather')$$, 'A plan that is under way can be cancelled');
reset role;
select is(pg_temp.state('p1'), 'cancelled:Weather', 'Weather is stored as Weather');
select is(pg_temp.state('p2'), 'cancelled:Not enough people', 'Stored as Not enough people');
select is(pg_temp.state('p3'), 'cancelled:Venue closed', 'Stored as Venue closed');
select is(pg_temp.state('p4'), 'cancelled:Maya is sick', 'Free text is stored as written');
select ok((select updated_at >= now() - interval '1 minute' from plans where id = pg_temp.id('p1')), 'updated_at is set');
select is(pg_temp.counts('p1'), '2/1/0/0', 'The answers stay on the cancelled plan');

-- Cancelling twice
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select cancel_plan(pg_temp.id('p1'), 'Not enough people')$$, 'Cancelling again does not fail');
reset role;
select is(pg_temp.state('p1'), 'cancelled:Weather', 'The first reason stays');

-- What invitees see
set local role authenticated;
select pg_temp.as_user('a');
select is((select cancel_reason from plans where id = pg_temp.id('p1')), 'Weather', 'An invitee still reads the plan and the reason');

-- After the cancel, nothing reopens it
select throws_ok($$select * from respond(pg_temp.id('p1'), 1, 'going')$$, 'P0001', 'plan_cancelled', 'Answers are refused');
select pg_temp.as_user('b');
select throws_ok($$select * from respond(pg_temp.id('p1'), 1, 'cant_go')$$, 'P0001', 'plan_cancelled', 'Answers are refused for everyone');
select pg_temp.as_user('maya');
select throws_ok($$select edit_plan(pg_temp.id('p1'), '{"note":"late"}')$$, 'P0001', 'plan_cancelled', 'Edits are refused');
reset role;
update experiences set price_min = 35, price_max = 35 where id = pg_temp.id('e');
select ok(public.apply_listing_changes() >= 0, 'The listing job runs');
select is(pg_temp.state('p1'), 'cancelled:Weather', 'A price change in the listing does not reopen a cancelled plan');
select is((select current_revision from plans where id = pg_temp.id('p1')), 1, 'The listing job adds no revision to a cancelled plan');

-- A cancel and an answer on one plan end with the plan cancelled, whichever commits first.
-- Cancel first is the "Answers are refused" checks above. Answer first is below. A single PGlite session
-- can't interleave two transactions, so a true overlap is not tested here; the plan row lock that
-- serialises them is what the prosrc check at the top confirms for cancel_plan.
set local role authenticated;
select pg_temp.as_user('b');
select lives_ok($$select * from respond(pg_temp.id('p5'), 1, 'going')$$, 'Order one: the answer commits first');
select pg_temp.as_user('maya');
select lives_ok($$select cancel_plan(pg_temp.id('p5'), 'Weather')$$, 'Order one: the cancel then lands');
reset role;
select is(pg_temp.state('p5'), 'cancelled:Weather', 'Order one ends cancelled');
select is(pg_temp.counts('p5'), '3/0/0/0', 'The answer that came first is kept');

select * from finish();
rollback;
