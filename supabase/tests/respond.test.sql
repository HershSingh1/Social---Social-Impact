begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;
create function pg_temp.counts(p text) returns text language sql as $$
  select going || '/' || awaiting || '/' || cant_go || '/' || needs_reconfirm from private.rsvp_counts(pg_temp.id(p)) $$;

-- Fixture (as superuser): organizer maya, five invitees, outsider (group member, not invited).
-- send_plan and edit_plan are separate issues, so the plan and the material edit are written directly.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','e','outsider']) n;
update profiles set display_name = id::text;
insert into groups (id, name, owner_id, client_key)
  values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n) from unnest(array['maya','outsider']) n;
insert into plans (id, group_id, organizer_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('p'), pg_temp.id('g'), pg_temp.id('maya'), 'Clay', 'art', 'sent', 1, pg_temp.id('pk'));
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  values (pg_temp.id('p'), 1, now() + interval '2 days', now() + interval '2 days 2 hours', 'Door', '{}', false),
         (pg_temp.id('p'), 2, now() + interval '3 days', now() + interval '3 days 2 hours', 'Door', '{}', false);
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id('p'), pg_temp.id(n), case n when 'maya' then 'going' else 'awaiting' end, 1
  from unnest(array['maya','a','b','c','d','e']) n;

select is(pg_temp.counts('p'), '1/5/0/0', 'Start 1/5/0/0');

set local role authenticated;
select pg_temp.as_user('a');
select is((select going || '/' || awaiting || '/' || cant_go || '/' || needs_reconfirm from respond(pg_temp.id('p'), 1, 'going')),
  '2/4/0/0', 'respond returns the four counts');
select pg_temp.as_user('b');
select is((select going from respond(pg_temp.id('p'), 1, 'going')), 3, 'Second Going');
reset role;
select is(pg_temp.counts('p'), '3/3/0/0', 'Counts 3/3/0/0');

set local role authenticated;
select pg_temp.as_user('c');
select lives_ok($$select * from respond(pg_temp.id('p'), 1, 'cant_go')$$, 'Can''t go');
reset role;
select is(pg_temp.counts('p'), '3/2/1/0', 'Counts 3/2/1/0');

-- Material edit (what edit_plan will do): revision 2, Going non-organizers need reconfirmation
update plans set current_revision = 2 where id = pg_temp.id('p');
update rsvps set status = 'needs_reconfirm' where plan_id = pg_temp.id('p') and status = 'going' and user_id <> pg_temp.id('maya');
select is(pg_temp.counts('p'), '1/2/1/2', 'Counts 1/2/1/2 after material edit');

set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$select * from respond(pg_temp.id('p'), 1, 'going')$$, 'P0001', 'stale_revision', 'Answer from the old screen rejected');
select lives_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, 'Reconfirm Going on revision 2');
reset role;
select is(pg_temp.counts('p'), '2/2/1/1', 'Counts 2/2/1/1');

set local role authenticated;
select pg_temp.as_user('b');
select lives_ok($$select * from respond(pg_temp.id('p'), 2, 'cant_go')$$, 'Reconfirm as Can''t go');
reset role;
select is(pg_temp.counts('p'), '2/2/2/0', 'Counts 2/2/2/0');
select is((select revision from rsvps where user_id = pg_temp.id('b')), 2, 'Answer stores the revision it was given on');

-- Errors and access
set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'cant_go')$$, 'P0001', 'organizer_cannot_decline', 'Organizer cannot decline');
select lives_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, 'Organizer can answer Going');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'maybe')$$, 'P0001', 'invalid_status', 'Only going or cant_go');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'awaiting')$$, 'P0001', 'invalid_status', 'Cannot return to awaiting');

select pg_temp.as_user('outsider');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, '42501', 'not_invited', 'Group member who is not invited cannot respond');
select is((select count(*) from plans), 0::bigint, 'Non-invited member cannot read the plan');
select is((select count(*) from rsvps), 0::bigint, 'Non-invited member cannot read RSVPs');
select throws_ok($$select * from respond(gen_random_uuid(), 1, 'going')$$, '42501', 'not_invited', 'Unknown plan looks the same');
select throws_ok($$insert into rsvps values (pg_temp.id('p'), pg_temp.id('outsider'), 'going', 2)$$, '42501', null, 'Clients cannot write rsvps');

reset role;
-- Removed invitee loses access and drops out of the counts
update rsvps set removed_at = now() where user_id = pg_temp.id('e');
select is(pg_temp.counts('p'), '2/1/2/0', 'Removed invitee not counted');
set local role authenticated;
select pg_temp.as_user('e');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, '42501', 'not_invited', 'Removed invitee cannot respond');

-- Profile and sign-in guards
reset role;
insert into auth.users (id) values (pg_temp.id('nameless'));
set local role authenticated;
select pg_temp.as_user('nameless');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, 'P0001', 'profile_required', 'Needs a profile name');
select pg_temp.as_user('a', true);
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, '28000', 'not_authenticated', 'Anonymous JWT rejected');
reset role;
set local role anon;
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, '42501', null, 'Signed-out cannot call respond');
reset role;

-- Locked once the current revision starts
update plan_revisions set start_at = now() - interval '1 minute', end_at = now() + interval '1 hour'
  where plan_id = pg_temp.id('p') and revision = 2;
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'cant_go')$$, 'P0001', 'answers_locked', 'Answers locked after start');
select pg_temp.as_user('maya');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, 'P0001', 'answers_locked', 'Organizer is locked too');

-- Cancelled plans refuse answers
reset role;
update plan_revisions set start_at = now() + interval '1 day', end_at = now() + interval '2 days'
  where plan_id = pg_temp.id('p') and revision = 2;
update plans set state = 'cancelled', cancel_reason = 'Weather' where id = pg_temp.id('p');
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, 'P0001', 'plan_cancelled', 'Cancelled plan refuses answers');
select is((select status from rsvps where user_id = pg_temp.id('a')), 'going', 'Failed answers leave the previous answer');

reset role;
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'rsvp_counts' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'rsvp_counts helper is not callable by clients');
select * from finish();
rollback;
