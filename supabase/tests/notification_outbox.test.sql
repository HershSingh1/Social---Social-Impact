begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u))::text, true) $$;
-- Who holds a row of this kind, optionally for one plan or pick, as sorted names. Run as the superuser.
create function pg_temp.got(k text, scope uuid default null) returns text language sql as $$
  select coalesce(string_agg(p.display_name, ',' order by p.display_name), '')
  from notification_log l join profiles p on p.id = l.user_id
  where l.kind = k and (scope is null or l.plan_id = scope or l.pick_id = scope) $$;
create function pg_temp.names(ids uuid[]) returns text language sql as $$
  select coalesce(string_agg(p.display_name, ',' order by p.display_name), '')
  from profiles p where p.id = any(ids) $$;
create function pg_temp.day(n int, hhmm text) returns text language sql as $$
  select to_char(now() + make_interval(days => n), 'YYYY-MM-DD') || 'T' || hhmm $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan','sam','riley','pat','lee']) n;
update profiles p set display_name = initcap(n) from unnest(array['maya','jordan','sam','riley','pat','lee']) n
  where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key)
  values (pg_temp.id('g'), 'Crew', pg_temp.id('maya'), pg_temp.id('g'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('g'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','jordan','sam','riley']) n; -- Pat and Lee are not in the group
insert into experiences (id, name, category, price_kind, timing_kind, source) values
  (pg_temp.id('clay'), 'Clay and conversation', 'Arts', 'exact', 'flexible', 'PLACEHOLDER: test'),
  (pg_temp.id('sketch'), 'Sketch and stroll', 'Arts', 'free', 'flexible', 'PLACEHOLDER: test'),
  (pg_temp.id('barton'), 'Barton Springs swim', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: test');

-- The table is the outbox and nobody but the service role touches it.
select has_table('public', 'notification_log', 'The outbox table exists');
select has_column('public', 'notification_log', 'sent_at', 'Rows are marked when they are sent');
select ok(exists (select 1 from pg_constraint where conname = 'notification_log_event_user' and contype = 'u'),
  'One row per (event, person)');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_log'::regclass), 'RLS is on');
select ok(not has_table_privilege('authenticated', 'public.notification_log', 'SELECT')
  and not has_table_privilege('authenticated', 'public.notification_log', 'INSERT')
  and not has_table_privilege('authenticated', 'public.notification_log', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notification_log', 'DELETE')
  and not has_table_privilege('anon', 'public.notification_log', 'SELECT'),
  'Clients have no access to the outbox');
select has_function('public', 'nudge', array['uuid', 'uuid[]'], 'Nudge has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.nudge(uuid,uuid[])', 'EXECUTE'), 'Signed-out clients cannot nudge');
select ok(not has_function_privilege('authenticated', 'public.notify_closing_picks()', 'EXECUTE'),
  'Clients cannot run the reminder job');

-- Jordan turns off pick results before anything happens.
set local role authenticated;
select pg_temp.as_user('jordan');
select lives_ok($$select public.set_notification_pref('pick_result', false)$$, 'Jordan turns off pick results');
select throws_ok('select count(*) from notification_log', '42501', null, 'A client cannot read the outbox');

-- Plan sent: invitees except the organizer.
select pg_temp.as_user('maya');
select lives_ok($$select public.send_plan(pg_temp.id('plan'), pg_temp.id('g'), pg_temp.id('sketch'),
  pg_temp.day(4, '14:00'), pg_temp.day(4, '16:00'), 'Park entrance', null,
  array[pg_temp.id('jordan'), pg_temp.id('sam')])$$, 'Maya sends a plan to Jordan and Sam');
reset role;
select is(pg_temp.got('plan_sent'), 'Jordan,Sam', 'Plan sent goes to the invitees and not to the organizer');

-- Retrying the same send changes nothing.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.send_plan(pg_temp.id('plan'), pg_temp.id('g'), pg_temp.id('sketch'),
  pg_temp.day(4, '14:00'), pg_temp.day(4, '16:00'), 'Park entrance', null,
  array[pg_temp.id('jordan'), pg_temp.id('sam')])$$, 'The same send again is accepted');
reset role;
select is(pg_temp.got('plan_sent'), 'Jordan,Sam', 'Retrying the send writes nothing new');
select is(private.write_notifications('plan_sent:' || (select id from plans limit 1), 'plan_sent',
  array[pg_temp.id('jordan'), pg_temp.id('sam')], (select id from plans limit 1), null), '{}'::uuid[],
  'Running the same event twice writes nothing');
select is((select count(*) from notification_log where kind = 'plan_sent'), 2::bigint, 'Still two rows');

-- Adding someone later invites them, once.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.add_invitees((select id from plans limit 1), array[pg_temp.id('riley')])$$,
  'Maya adds Riley');
select lives_ok($$select public.add_invitees((select id from plans limit 1), array[pg_temp.id('riley')])$$,
  'Adding Riley again is accepted');
reset role;
select is(pg_temp.got('plan_sent'), 'Jordan,Riley,Sam', 'Riley is told once');

-- Someone who joins through a plan link was not invited, so no "invited you" for them.
select pg_temp.as_user('pat');
insert into rsvps (plan_id, user_id, status, revision) values ((select id from plans limit 1), pg_temp.id('pat'), 'awaiting', 1);
select is(pg_temp.got('plan_sent'), 'Jordan,Riley,Sam', 'Joining by link does not notify the joiner');

-- A draft that becomes Sent invites the people already on it.
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('draft'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('clay'), 'Clay and conversation', 'Arts', 'draft', 1, pg_temp.id('draft'));
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  values (pg_temp.id('draft'), 1, now() + interval '9 days', now() + interval '9 days 2 hours', 'Studio', '{}', false);
insert into rsvps (plan_id, user_id, status, revision) values
  (pg_temp.id('draft'), pg_temp.id('maya'), 'going', 1), (pg_temp.id('draft'), pg_temp.id('sam'), 'awaiting', 1);
select is(pg_temp.got('plan_sent', pg_temp.id('draft')), '', 'A draft tells nobody');
update plans set state = 'sent' where id = pg_temp.id('draft');
select is(pg_temp.got('plan_sent', pg_temp.id('draft')), 'Sam', 'Sending the draft invites the people on it');

-- Pick opened: members except the organizer, and Jordan still gets this kind.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.create_pick(pg_temp.id('g'),
  jsonb_build_array(jsonb_build_object('experience_id', pg_temp.id('clay')), jsonb_build_object('experience_id', pg_temp.id('sketch'))),
  now() + interval '2 hours', null, pg_temp.id('pickA'))$$, 'Maya opens a pick');
reset role;
select is(pg_temp.got('pick_opened'), 'Jordan,Riley,Sam', 'Pick opened goes to members except the organizer');
select is(pg_temp.got('pick_closing'), '', 'No reminder yet');
select is(public.notify_closing_picks(), 0, 'The reminder job writes nothing while the pick closes in two hours');

-- Pick result: every member, except the one who turned it off.
set local role authenticated;
select pg_temp.as_user('sam');
select lives_ok($$select public.cast_vote((select id from pick_options where pick_id = (select id from picks limit 1) and position = 1), 'yes')$$,
  'Sam votes');
select pg_temp.as_user('maya');
select lives_ok($$select public.close_pick((select id from picks limit 1))$$, 'Maya closes the pick');
reset role;
select is(pg_temp.got('pick_result'), 'Maya,Riley,Sam', 'Turning off pick results for Jordan stops only his result row');
select is(pg_temp.got('pick_opened'), 'Jordan,Riley,Sam', 'His other rows are untouched');

-- A pick nobody voted on has no winner and so no result to announce.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.create_pick(pg_temp.id('g'),
  jsonb_build_array(jsonb_build_object('experience_id', pg_temp.id('clay')), jsonb_build_object('experience_id', pg_temp.id('barton'))),
  now() + interval '2 hours', null, pg_temp.id('pickB'))$$, 'Maya opens a second pick');
select lives_ok($$select public.close_pick((select id from picks where client_key = pg_temp.id('pickB')))$$, 'It closes with no votes');
reset role;
select is(pg_temp.got('pick_result', (select id from picks where client_key = pg_temp.id('pickB'))), '',
  'No votes, no winner, no result row');

-- One-hour reminder: members who have not voted on every option.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.create_pick(pg_temp.id('g'),
  jsonb_build_array(jsonb_build_object('experience_id', pg_temp.id('clay')), jsonb_build_object('experience_id', pg_temp.id('sketch'))),
  now() + interval '2 hours', null, pg_temp.id('pickC'))$$, 'Maya opens a third pick');
reset role;
update picks set deadline = now() + interval '30 minutes' where client_key = pg_temp.id('pickC');
set local role authenticated;
select pg_temp.as_user('jordan');
select lives_ok($$select public.cast_vote(o.id, 'yes') from pick_options o
  where o.pick_id = (select id from picks where client_key = pg_temp.id('pickC'))$$, 'Jordan answers every option');
select pg_temp.as_user('sam');
select lives_ok($$select public.cast_vote(o.id, 'maybe') from pick_options o
  where o.pick_id = (select id from picks where client_key = pg_temp.id('pickC')) and o.position = 1$$, 'Sam answers only one');
reset role;
select is(public.notify_closing_picks(), 3, 'The job writes a reminder for each member still to vote');
select is(pg_temp.got('pick_closing'), 'Maya,Riley,Sam', 'Jordan answered, so his reminder is not written');
select is(public.notify_closing_picks(), 0, 'Running the job again writes nothing');

-- A reminder that has not gone out is dropped when the person finishes voting.
set local role authenticated;
select pg_temp.as_user('sam');
select lives_ok($$select public.cast_vote(o.id, 'no') from pick_options o
  where o.pick_id = (select id from picks where client_key = pg_temp.id('pickC')) and o.position = 2$$, 'Sam finishes voting');
reset role;
select is(pg_temp.got('pick_closing'), 'Maya,Riley', 'Sam''s unsent reminder is dropped');
update notification_log set sent_at = now() where kind = 'pick_closing' and user_id = pg_temp.id('maya');

-- Closing the pick drops reminders that have not gone out, and keeps the ones that did.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.close_pick((select id from picks where client_key = pg_temp.id('pickC')))$$, 'Maya closes the pick');
reset role;
select is(pg_temp.got('pick_closing'), 'Maya', 'Only the reminder that already went out is kept');

-- A reminder is not written for someone who turned it off.
update picks set state = 'open', closed_at = null, winner_option_id = null where client_key = pg_temp.id('pickC');
delete from notification_log where kind = 'pick_closing';
insert into notification_prefs (user_id, kind, enabled) values (pg_temp.id('riley'), 'pick_closing', false);
select is(public.notify_closing_picks(), 1, 'Riley turned reminders off, so only Maya gets one');
select is(pg_temp.got('pick_closing'), 'Maya', 'The reminder follows the preference');
update picks set state = 'cancelled' where client_key = pg_temp.id('pickC');
select is(pg_temp.got('pick_closing'), '', 'Cancelling the pick drops reminders that have not gone out');

-- Nudge.
set local role authenticated;
select pg_temp.as_user('jordan');
select lives_ok($$select public.respond((select id from plans where client_key = pg_temp.id('plan')), 1, 'going')$$, 'Jordan says Going');
select throws_ok($$select public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam')])$$,
  '42501', 'not_organizer', 'A guest of the plan cannot nudge');
select pg_temp.as_user('lee');
select throws_ok($$select public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam')])$$,
  '42501', 'not_organizer', 'Someone outside the plan cannot nudge');
select pg_temp.as_user('maya');
select throws_ok($$select public.nudge((select id from plans where client_key = pg_temp.id('plan')), null)$$,
  'P0001', 'invalid_user_ids', 'A missing list is refused');
select is(public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam'), pg_temp.id('jordan'), pg_temp.id('lee'), pg_temp.id('maya')]), array[pg_temp.id('sam')],
  'Only invitees still Awaiting reply are nudged: not Going, not outside the plan, not the organizer');
reset role;
select is(pg_temp.got('organizer_nudge'), 'Sam', 'One nudge row for Sam');

set local role authenticated;
select pg_temp.as_user('maya');
select is(public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam')]), '{}'::uuid[],
  'A second nudge within 24 hours is refused for that person');
select is(public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam'), pg_temp.id('riley')]), array[pg_temp.id('riley')], 'Riley can still be nudged');
reset role;
select is(pg_temp.got('organizer_nudge'), 'Riley,Sam', 'Sam has one nudge row, Riley one');

-- Twenty-four hours later Sam can be nudged again; with the kind off nobody is written.
update notification_log set created_at = now() - interval '25 hours' where kind = 'organizer_nudge';
set local role authenticated;
select pg_temp.as_user('maya');
select is(public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam')]), array[pg_temp.id('sam')],
  'After 24 hours Sam can be nudged again');
reset role;
select is((select count(*) from notification_log where kind = 'organizer_nudge' and user_id = pg_temp.id('sam')), 2::bigint,
  'Sam now has two nudge rows');
update notification_log set created_at = now() - interval '25 hours' where kind = 'organizer_nudge';
insert into notification_prefs (user_id, kind, enabled) values (pg_temp.id('sam'), 'organizer_nudge', false);
set local role authenticated;
select pg_temp.as_user('maya');
select is(public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam')]), '{}'::uuid[],
  'Sam turned nudges off, so nothing is written for him');
reset role;
delete from notification_prefs where kind = 'organizer_nudge';

-- Material change: Going invitees only, once per revision.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.edit_plan((select id from plans where client_key = pg_temp.id('plan')),
  jsonb_build_object('note', 'Bring water'))$$, 'A note change is not material');
reset role;
select is(pg_temp.got('material_change'), '', 'A note change tells nobody');
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.edit_plan((select id from plans where client_key = pg_temp.id('plan')),
  jsonb_build_object('start_local', pg_temp.day(5, '15:00'), 'end_local', pg_temp.day(5, '17:00')))$$, 'Maya moves the time');
reset role;
select is(pg_temp.got('material_change'), 'Jordan', 'Only Jordan, who was Going, is asked again');
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.edit_plan((select id from plans where client_key = pg_temp.id('plan')),
  jsonb_build_object('meeting_point', 'Main gate'))$$, 'Maya changes the meeting point');
reset role;
select is((select count(*) from notification_log where kind = 'material_change'), 1::bigint,
  'Nobody was Going any more, so the second change writes nothing');
set local role authenticated;
select pg_temp.as_user('jordan');
select lives_ok($$select public.respond((select id from plans where client_key = pg_temp.id('plan')), 3, 'going')$$,
  'Jordan confirms the new details');
select pg_temp.as_user('maya');
select lives_ok($$select public.edit_plan((select id from plans where client_key = pg_temp.id('plan')),
  jsonb_build_object('start_local', pg_temp.day(6, '15:00'), 'end_local', pg_temp.day(6, '17:00')))$$, 'Maya moves the time again');
reset role;
select is((select count(*) from notification_log where kind = 'material_change' and user_id = pg_temp.id('jordan')), 2::bigint,
  'A later revision notifies again');

-- Cancellation: every invitee, once. Unsent change prompts and nudges are dropped.
update notification_log set sent_at = now()
  where kind = 'organizer_nudge' and user_id = pg_temp.id('riley');
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.cancel_plan((select id from plans where client_key = pg_temp.id('plan')), 'Weather')$$, 'Maya cancels');
select lives_ok($$select public.cancel_plan((select id from plans where client_key = pg_temp.id('plan')), 'Weather')$$, 'Cancelling again is accepted');
reset role;
select is(pg_temp.got('cancellation', (select id from plans where client_key = pg_temp.id('plan'))), 'Jordan,Pat,Riley,Sam',
  'Cancellation goes to every invitee and not to the organizer');
select is((select count(*) from notification_log where kind = 'cancellation'), 4::bigint, 'Cancelling twice writes nothing new');
select is(pg_temp.got('material_change'), '', 'Unsent change prompts are dropped');
select is(pg_temp.got('organizer_nudge'), 'Riley', 'Unsent nudges are dropped and the one that went out is kept');
set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select public.nudge((select id from plans where client_key = pg_temp.id('plan')), array[pg_temp.id('sam')])$$,
  'P0001', 'plan_cancelled', 'A cancelled plan cannot be nudged');

-- No private text in any row.
reset role;
select ok(not exists (select 1 from notification_log where event_key !~ '^[a-z_]+:[0-9a-f-]{36}(:[0-9a-f-]{36}|:[0-9]+)?$'),
  'Event keys hold a kind and ids only');

select * from finish();
rollback;
