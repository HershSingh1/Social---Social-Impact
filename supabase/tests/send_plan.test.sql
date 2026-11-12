begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;
create function pg_temp.counts(p uuid) returns text language sql as $$
  select going || '/' || awaiting || '/' || cant_go || '/' || needs_reconfirm from private.rsvp_counts(p) $$;
create function pg_temp.local_in(i interval) returns text language sql as $$
  select to_char((now() + i) at time zone 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') $$;
-- send_plan as user u with key k. o overrides: group, ex, start, end, point, note, rec (names), pick, tz.
create function pg_temp.send(u text, k text, o jsonb default '{}') returns uuid language plpgsql as $$
begin
  perform pg_temp.as_user(u);
  set local role authenticated;
  return public.send_plan(pg_temp.id(k), coalesce(pg_temp.id(o->>'group'), pg_temp.id('g')),
    coalesce(pg_temp.id(o->>'ex'), pg_temp.id('ex')), coalesce(o->>'start', pg_temp.local_in('3 days')),
    coalesce(o->>'end', pg_temp.local_in('3 days 2 hours')), coalesce(o->>'point', 'Door'), o->>'note',
    array(select pg_temp.id(x) from jsonb_array_elements_text(o->'rec') x),
    pg_temp.id(o->>'pick'), coalesce(o->>'tz', 'America/Chicago'));
end $$;

-- Fixture: maya organizes; a, b, c are members; d is a removed member; outsider is not in the group.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','outsider']) n;
update profiles set display_name = id::text;
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk')),
  (pg_temp.id('g2'), 'G2', pg_temp.id('outsider'), pg_temp.id('gk2')),
  (pg_temp.id('old'), 'Old', pg_temp.id('maya'), pg_temp.id('oldk'));
update groups set archived_at = now() where id = pg_temp.id('old');
insert into group_members (group_id, user_id, role) select pg_temp.id('g'), pg_temp.id(n), case n when 'maya' then 'owner' else 'member' end
  from unnest(array['maya','a','b','c','d']) n;
update group_members set removed_at = now() where user_id = pg_temp.id('d');
insert into group_members (group_id, user_id, role) values (pg_temp.id('g2'), pg_temp.id('outsider'), 'owner'), (pg_temp.id('old'), pg_temp.id('maya'), 'owner');
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, booking_required, source) values
  (pg_temp.id('ex'), 'Clay and conversation', 'art', 'exact', 25, 25, 'flexible', true, 'PLACEHOLDER: test'),
  (pg_temp.id('fixed'), 'Evening show', 'music', 'exact', 40, 40, 'fixed', true, 'PLACEHOLDER: test');
insert into picks (id, group_id, organizer_id, client_key, deadline, state) values
  (pg_temp.id('closed'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('pk1'), now() + interval '2 hours', 'closed'),
  (pg_temp.id('closed2'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('pk2'), now() + interval '2 hours', 'closed'),
  (pg_temp.id('open'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('pk3'), now() + interval '2 hours', 'open'),
  (pg_temp.id('other'), pg_temp.id('g2'), pg_temp.id('outsider'), pg_temp.id('pk4'), now() + interval '2 hours', 'closed');

-- Send: organizer Going, recipients Awaiting; the organizer and duplicates in recipients are ignored
select lives_ok($$select pg_temp.send('maya', 'k1', '{"rec":["a","b","a","maya"],"note":"  Bring cash  "}')$$, 'Send succeeds');
reset role;
create temp table sent as select id from plans where client_key = pg_temp.id('k1');
grant select on sent to public;
select is((select count(*) from plans), 1::bigint, 'One plan');
select is((select state || '/' || current_revision from plans), 'sent/1', 'Plan is Sent at revision 1');
select is((select experience_name || '/' || experience_category from plans), 'Clay and conversation/art', 'Experience snapshot on the plan (G7)');
select is((select group_id from plans), pg_temp.id('g'), 'Plan belongs to the group');
select is((select organizer_id from plans), pg_temp.id('maya'), 'Caller is the organizer');
select is(pg_temp.counts((select id from sent)), '1/2/0/0', 'Organizer Going, two Awaiting reply');
select is((select count(*) from rsvps), 3::bigint, 'One invitation per person');
select is((select status from rsvps where user_id = pg_temp.id('maya')), 'going', 'Organizer is Going');
select is((select meeting_point || '/' || note || '/' || time_zone from plan_revisions), 'Door/Bring cash/America/Chicago', 'Revision 1 holds the details, note trimmed');
select is((select (end_at - start_at) from plan_revisions), interval '2 hours', 'Start and end stored');
select is((select price_snapshot from plan_revisions), '{"kind":"exact","min":25,"max":25}'::jsonb, 'Price snapshot taken from the experience');
select is((select booking_required from plan_revisions), true, 'Booking flag taken from the experience');

-- Retry: same key and payload returns the same plan, in any recipient order, with no second plan or invitation
select is(pg_temp.send('maya', 'k1', '{"rec":["b","maya","a"],"note":"Bring cash"}'), (select id from sent), 'Retry returns the same plan id');
reset role;
select is((select count(*) from plans), 1::bigint, 'Retry made no second plan');
select is((select count(*) from rsvps), 3::bigint, 'Retry made no second invitation');
-- Reused key
select throws_ok($$select pg_temp.send('maya', 'k1', '{"rec":["a","b"],"note":"Different"}')$$, 'P0001', 'client_key_conflict', 'Same key, different note is a conflict');
reset role;
select throws_ok($$select pg_temp.send('maya', 'k1', '{"rec":["a"]}')$$, 'P0001', 'client_key_conflict', 'Same key, different recipients is a conflict');
reset role;
select throws_ok($$select pg_temp.send('a', 'k1', '{"rec":["a","b"],"note":"Bring cash"}')$$, 'P0001', 'client_key_conflict', 'Someone else''s key is a conflict, not their plan');
reset role;

-- Invitees see the plan; strangers don't
set local role authenticated;
select pg_temp.as_user('a');
select is((select count(*) from plans), 1::bigint, 'Invitee reads the plan');
select pg_temp.as_user('c');
select is((select count(*) from plans), 0::bigint, 'Group member who was not invited cannot read it');
select pg_temp.as_user('outsider');
select is((select count(*) from plans), 0::bigint, 'Outsider cannot read it');
select throws_ok($$select * from private.send_plan_requests$$, '42501', null, 'Clients cannot read the request log');
select throws_ok($$insert into plans (group_id, organizer_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('g'), pg_temp.id('outsider'), 'x', 'x', 'sent', 1, gen_random_uuid())$$, '42501', null, 'Clients cannot write plans');
reset role;

-- Works with the rest of the plan flow: a reconfirm cycle through edit_plan and respond
set local role authenticated;
select pg_temp.as_user('a');
select lives_ok($$select * from respond((select id from sent), 1, 'going')$$, 'Invitee answers Going');
select pg_temp.as_user('maya');
select is((select (edit_plan((select id from sent), jsonb_build_object('start_local', pg_temp.local_in('4 days'), 'end_local', pg_temp.local_in('4 days 2 hours'))))->>'needs_reconfirm'), '1', 'Material edit asks the Going invitee to reconfirm');
reset role;
select is(pg_temp.counts((select id from sent)), '1/1/0/1', 'Counts 1/1/0/1 after the edit');

-- Validation: each failure leaves nothing behind
select throws_ok($$select pg_temp.send('maya', 'v1', jsonb_build_object('start', pg_temp.local_in('-1 hour'), 'end', pg_temp.local_in('1 hour')))$$, 'P0001', 'invalid_times', 'Start in the past');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v2', jsonb_build_object('start', pg_temp.local_in('3 days'), 'end', pg_temp.local_in('3 days')))$$, 'P0001', 'invalid_times', 'End not after start');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v3', '{"start":"2037-07-01T18:00Z","end":"2037-07-01T20:00"}')$$, 'P0001', 'invalid_times', 'Offsets are not accepted');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v4', '{"start":"2037-03-08T02:30","end":"2037-03-08T04:00"}')$$, 'P0001', 'nonexistent_local_time', 'Nonexistent DST time rejected');
reset role;
select lives_ok($$select pg_temp.send('maya', 'v5', '{"start":"2037-11-01T01:30","end":"2037-11-01T04:00"}')$$, 'Repeated fall-back hour accepted');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v6', '{"point":"   "}')$$, 'P0001', 'invalid_meeting_point', 'Blank meeting point');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v7', jsonb_build_object('point', repeat('x', 201)))$$, 'P0001', 'invalid_meeting_point', 'Meeting point over 200');
reset role;
select lives_ok($$select pg_temp.send('maya', 'v8', jsonb_build_object('point', repeat('x', 200), 'note', repeat('n', 500)))$$, '200-character point and 500-character note are fine');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v9', jsonb_build_object('note', repeat('n', 501)))$$, 'P0001', 'invalid_note', 'Note over 500');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v10', '{"rec":["outsider"]}')$$, 'P0001', 'recipient_not_a_member', 'Recipient outside the group');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v11', '{"rec":["d"]}')$$, 'P0001', 'recipient_not_a_member', 'Recipient who left the group');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v12', '{"tz":"America/New_York"}')$$, 'P0001', 'invalid_time_zone', 'Only America/Chicago for now');
reset role;
select lives_ok($$select pg_temp.send('maya', 'v13', '{"ex":"fixed"}')$$, 'Fixed-time activity can be planned at any time (G6)');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v14', '{"ex":"nope"}')$$, 'P0001', 'experience_not_found', 'Unknown experience');
reset role;
select throws_ok($$select pg_temp.send('outsider', 'v15')$$, '42501', 'not_a_member', 'Caller must be in the group');
reset role;
select throws_ok($$select pg_temp.send('maya', 'v16', '{"group":"old"}')$$, 'P0001', 'group_archived', 'Archived group');
reset role;
select is((select count(*) from plans), 4::bigint, 'Only the plans that passed validation exist (k1, v5, v8, v13)');
select is((select count(*) from private.send_plan_requests), 4::bigint, 'No request log rows for failed sends');
select is((select count(*) from rsvps), 6::bigint, 'No stray invitations from failures: 3 for k1, 1 each for v5, v8 and v13');

-- Organizer alone is allowed
select lives_ok($$select pg_temp.send('c', 'solo')$$, 'Organizer-only plan is allowed');
reset role;
select is(pg_temp.counts((select id from plans where client_key = pg_temp.id('solo'))), '1/0/0/0', 'Alone: 1 Going, nobody else');

-- From a pick
select throws_ok($$select pg_temp.send('maya', 'p1', '{"pick":"open"}')$$, 'P0001', 'pick_not_closed', 'Open pick cannot be planned');
reset role;
select throws_ok($$select pg_temp.send('maya', 'p2', '{"pick":"other"}')$$, 'P0001', 'pick_not_found', 'Pick from another group');
reset role;
select throws_ok($$select pg_temp.send('maya', 'p3', '{"pick":"nope"}')$$, 'P0001', 'pick_not_found', 'Unknown pick');
reset role;
select throws_ok($$select pg_temp.send('a', 'p4', '{"pick":"closed"}')$$, '42501', 'not_organizer', 'Only the pick organizer plans it');
reset role;
select is((select state from picks where id = pg_temp.id('closed')), 'closed', 'Failed attempts left the pick Closed');
select lives_ok($$select pg_temp.send('maya', 'p5', '{"pick":"closed","rec":["a"]}')$$, 'Plan from a closed pick');
reset role;
select is((select state from picks where id = pg_temp.id('closed')), 'planned', 'Pick becomes Planned');
select is((select pick_id from plans where client_key = pg_temp.id('p5')), pg_temp.id('closed'), 'Plan links to its pick');
select is(pg_temp.send('maya', 'p5', '{"pick":"closed","rec":["a"]}'), (select id from plans where client_key = pg_temp.id('p5')), 'Retry after the pick turned Planned still returns the plan');
reset role;
select throws_ok($$select pg_temp.send('maya', 'p6', '{"pick":"closed"}')$$, 'P0001', 'pick_already_planned', 'A second plan from the same pick is refused');
reset role;
select is((select count(*) from plans where pick_id = pg_temp.id('closed')), 1::bigint, 'One plan per pick');

-- Sign-in guards
insert into auth.users (id) values (pg_temp.id('nameless'));
select throws_ok($$select pg_temp.send('nameless', 'g1')$$, 'P0001', 'profile_required', 'Needs a profile name');
reset role;
set local role authenticated;
select pg_temp.as_user('maya', true);
select throws_ok($$select public.send_plan(gen_random_uuid(), pg_temp.id('g'), pg_temp.id('ex'), '2037-07-01T18:00', '2037-07-01T20:00', 'Door')$$, '28000', 'not_authenticated', 'Anonymous JWT rejected');
reset role;
set local role anon;
select throws_ok($$select public.send_plan(gen_random_uuid(), pg_temp.id('g'), pg_temp.id('ex'), '2037-07-01T18:00', '2037-07-01T20:00', 'Door')$$, '42501', null, 'Signed-out cannot call send_plan');
reset role;
select * from finish();
rollback;
