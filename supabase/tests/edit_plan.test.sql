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
-- A Chicago wall-clock string "offset" from now, the way the app sends it.
create function pg_temp.local_in(i interval) returns text language sql as $$
  select to_char((now() + i) at time zone 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') $$;
create function pg_temp.edit(u text, changes jsonb) returns jsonb language plpgsql as $$
begin
  perform pg_temp.as_user(u);
  set local role authenticated;
  return (select public.edit_plan(pg_temp.id('p'), changes));
end $$;

-- Fixture (as superuser): organizer maya; a, b going; c awaiting; d can't go; outsider is a group member, not invited.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','outsider']) n;
update profiles set display_name = id::text;
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n) from unnest(array['maya','outsider']) n;
insert into plans (id, group_id, organizer_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('p'), pg_temp.id('g'), pg_temp.id('maya'), 'Clay', 'art', 'sent', 1, pg_temp.id('pk'));
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, note, price_snapshot, booking_required)
  values (pg_temp.id('p'), 1, now() + interval '2 days', now() + interval '2 days 2 hours', 'Door', 'Bring cash', '{"min":20}', true);
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id('p'), pg_temp.id(n), case when n in ('maya','a','b') then 'going' when n = 'c' then 'awaiting' else 'cant_go' end, 1
  from unnest(array['maya','a','b','c','d']) n;
update plans set updated_at = now() - interval '1 hour' where id = pg_temp.id('p');
select is(pg_temp.counts('p'), '3/1/1/0', 'Start 3/1/1/0');

-- Minor edit: note only keeps the revision and everyone's answer
select is(pg_temp.edit('maya', '{"note":"Bring a jacket"}'), '{"material":false,"changed":["note"],"revision":1,"needs_reconfirm":0}'::jsonb,
  'Note-only edit is minor');
reset role;
select is(pg_temp.counts('p'), '3/1/1/0', 'Minor edit changes no answers');
select is((select count(*) from plan_revisions where plan_id = pg_temp.id('p')), 1::bigint, 'Minor edit adds no revision');
select is((select note from plan_revisions where plan_id = pg_temp.id('p') and revision = 1), 'Bring a jacket', 'Note updated in place');
select ok((select updated_at > now() - interval '1 minute' from plans where id = pg_temp.id('p')), 'Minor edit sets updated_at for the Updated label');

-- No-op: same values are not a change
select is(pg_temp.edit('maya', jsonb_build_object('meeting_point', 'Door', 'note', 'Bring a jacket')),
  '{"material":false,"changed":[],"revision":1,"needs_reconfirm":0}'::jsonb, 'Setting current values changes nothing');
reset role;
select is(pg_temp.edit('maya', '{"note":null}')->>'changed', '["note"]', 'A null note clears it');
reset role;
select is((select note from plan_revisions where revision = 1), null, 'Note cleared');

-- Material edit: new start time
select is(pg_temp.edit('maya', jsonb_build_object('start_local', pg_temp.local_in('3 days'), 'end_local', pg_temp.local_in('3 days 2 hours'))),
  '{"material":true,"changed":["start_local","end_local"],"revision":2,"needs_reconfirm":2}'::jsonb, 'Time change makes revision 2 and flips two Going invitees');
reset role;
select is(pg_temp.counts('p'), '1/1/1/2', 'Only the organizer is still Going');
select is((select status from rsvps where user_id = pg_temp.id('maya')), 'going', 'Organizer stays Going');
select is((select revision from rsvps where user_id = pg_temp.id('maya')), 2, 'Organizer is Going on the new revision');
select is((select status from rsvps where user_id = pg_temp.id('c')), 'awaiting', 'Awaiting unchanged');
select is((select status from rsvps where user_id = pg_temp.id('d')), 'cant_go', 'Can''t go unchanged');
select is((select current_revision from plans where id = pg_temp.id('p')), 2, 'Plan points at revision 2');
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p') and revision = 2), '{"min":20}'::jsonb, 'Price carries over');
select is((select booking_required from plan_revisions where plan_id = pg_temp.id('p') and revision = 2), true, 'Booking flag carries over');

-- Old revision stays readable to invitees
set local role authenticated;
select pg_temp.as_user('a');
select is((select count(*) from plan_revisions where plan_id = pg_temp.id('p')), 2::bigint, 'Invitee reads both revisions');
select ok((select start_at < (select start_at from plan_revisions where revision = 2) from plan_revisions where revision = 1), 'Old time is still there for the banner');
select throws_ok($$select * from respond(pg_temp.id('p'), 1, 'going')$$, 'P0001', 'stale_revision', 'Answer from the old screen is rejected');
select lives_ok($$select * from respond(pg_temp.id('p'), 2, 'going')$$, 'Reconfirm on revision 2');
reset role;
select is(pg_temp.counts('p'), '2/1/1/1', 'Counts 2/1/1/1 after one reconfirm');

-- Several edits in a row: only the latest needs confirming
select is(pg_temp.edit('maya', '{"meeting_point":"Side gate","note":"Rain plan: inside"}'),
  '{"material":true,"changed":["meeting_point","note"],"revision":3,"needs_reconfirm":1}'::jsonb, 'Meeting point change is material, and its note lands on the new revision');
reset role;
select is((select note from plan_revisions where revision = 3), 'Rain plan: inside', 'New revision carries the new note');
select is((select note from plan_revisions where revision = 2), null, 'Old revision keeps its own note');
select is(pg_temp.counts('p'), '1/1/1/2', 'Counts 1/1/1/2 after second material edit');

-- Times are stored in UTC and read as America/Chicago (CDT is UTC-5)
select is(pg_temp.edit('maya', '{"start_local":"2037-07-01T18:00","end_local":"2037-07-01T20:00"}')->>'revision', '4', 'Summer edit');
reset role;
select is((select start_at from plan_revisions where revision = 4), '2037-07-01 23:00:00+00'::timestamptz, 'Stored as UTC');
select is((select time_zone from plan_revisions where revision = 4), 'America/Chicago', 'Zone kept');
-- DST: 2037-03-08 02:30 does not exist in Chicago; 2037-11-01 01:30 happens twice and is accepted
select throws_ok(format($$select pg_temp.edit('maya', '{"start_local":"2037-03-08T02:30","end_local":"2037-03-08T04:00"}')$$), 'P0001', 'nonexistent_local_time', 'Nonexistent DST time rejected');
reset role;
select lives_ok($$select pg_temp.edit('maya', '{"start_local":"2037-11-01T01:30","end_local":"2037-11-01T04:00"}')$$, 'Repeated fall-back hour accepted');
reset role;

-- Validation
select throws_ok($$select pg_temp.edit('maya', '{"start_local":"2037-07-01T18:00Z"}')$$, 'P0001', 'invalid_changes', 'Offsets are not accepted; the zone is America/Chicago');
reset role;
select throws_ok($$select pg_temp.edit('maya', '{"price":5}')$$, 'P0001', 'invalid_changes', 'Unknown keys rejected');
reset role;
select throws_ok($$select pg_temp.edit('maya', '{"meeting_point":"  "}')$$, 'P0001', 'invalid_changes', 'Blank meeting point rejected');
reset role;
select throws_ok($$select pg_temp.edit('maya', '[]')$$, 'P0001', 'invalid_changes', 'Changes must be an object');
reset role;
select throws_ok($$select pg_temp.edit('maya', '{"end_local":"2000-01-01T10:00"}')$$, 'P0001', 'invalid_times', 'End before start rejected');
reset role;
select throws_ok($$select pg_temp.edit('maya', '{"start_local":"2000-01-01T10:00","end_local":"2000-01-01T11:00"}')$$, 'P0001', 'invalid_times', 'Start in the past rejected');
reset role;
select is((select current_revision from plans where id = pg_temp.id('p')), 5, 'Rejected edits created no revision');

-- Access
select throws_ok($$select pg_temp.edit('a', '{"note":"x"}')$$, '42501', 'not_organizer', 'Invitee cannot edit');
reset role;
select throws_ok($$select pg_temp.edit('outsider', '{"note":"x"}')$$, '42501', 'not_organizer', 'Non-invited member cannot edit');
reset role;
select throws_ok($$select public.edit_plan(gen_random_uuid(), '{"note":"x"}')$$, '42501', 'not_organizer', 'Unknown plan looks the same');
reset role;
insert into auth.users (id) values (pg_temp.id('nameless'));
set local role authenticated;
select pg_temp.as_user('nameless');
select throws_ok($$select public.edit_plan(pg_temp.id('p'), '{"note":"x"}')$$, 'P0001', 'profile_required', 'Needs a profile name');
select pg_temp.as_user('maya', true);
select throws_ok($$select public.edit_plan(pg_temp.id('p'), '{"note":"x"}')$$, '28000', 'not_authenticated', 'Anonymous JWT rejected');
select pg_temp.as_user('maya');
select throws_ok($$insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  values (pg_temp.id('p'), 9, now(), now() + interval '1 hour', 'x', '{}', false)$$, '42501', null, 'Clients cannot write plan_revisions');
reset role;
set local role anon;
select throws_ok($$select public.edit_plan(pg_temp.id('p'), '{"note":"x"}')$$, '42501', null, 'Signed-out cannot call edit_plan');
reset role;
select ok(not has_function_privilege('authenticated', 'private.local_to_utc(timestamp)', 'EXECUTE'), 'Time helper is not callable by clients');

-- Drafts, started and cancelled plans
insert into plans (id, group_id, organizer_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('draft'), pg_temp.id('g'), pg_temp.id('maya'), 'D', 'art', 'draft', 1, pg_temp.id('dk'));
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  values (pg_temp.id('draft'), 1, now() + interval '2 days', now() + interval '3 days', 'Door', '{}', false);
set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select public.edit_plan(pg_temp.id('draft'), '{"note":"x"}')$$, '42501', 'not_organizer', 'send_plan, not edit_plan, handles drafts');
reset role;
update plan_revisions set start_at = now() - interval '1 minute', end_at = now() + interval '1 hour'
  where plan_id = pg_temp.id('p') and revision = 5;
select throws_ok($$select pg_temp.edit('maya', '{"note":"late"}')$$, 'P0001', 'plan_started', 'Refused once the plan has started');
reset role;
update plan_revisions set start_at = now() + interval '1 day', end_at = now() + interval '2 days'
  where plan_id = pg_temp.id('p') and revision = 5;
update plans set state = 'cancelled', cancel_reason = 'Weather' where id = pg_temp.id('p');
select throws_ok($$select pg_temp.edit('maya', '{"note":"late"}')$$, 'P0001', 'plan_cancelled', 'Cancelled plan refuses edits');
reset role;
select * from finish();
rollback;
