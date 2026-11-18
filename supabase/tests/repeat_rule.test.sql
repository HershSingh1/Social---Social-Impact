begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u))::text, true) $$;
create function pg_temp.day(n int, hhmm text) returns text language sql as $$
  select to_char(now() + make_interval(days => n), 'YYYY-MM-DD') || 'T' || hhmm $$;
-- A plan's id from the client key it was sent with.
create function pg_temp.pid(plan text) returns uuid language sql as $$
  select id from plans where client_key = pg_temp.id(plan) $$;
-- Moves a plan's current revision so its start is `d` from now. Run as the superuser.
create function pg_temp.start_in(plan text, d interval) returns void language sql as $$
  update plan_revisions v set start_at = now() + d, end_at = now() + d + interval '2 hours'
  from plans p where p.id = pg_temp.pid(plan) and v.plan_id = p.id and v.revision = p.current_revision $$;
create function pg_temp.reminders(plan text) returns bigint language sql as $$
  select count(*) from notification_log where kind = 'plan_again' and plan_id = pg_temp.pid(plan) $$;
create function pg_temp.send(plan text) returns void language sql as $$
  select public.send_plan(pg_temp.id(plan), pg_temp.id('g'), pg_temp.id('sketch'),
    pg_temp.day(4, '14:00'), pg_temp.day(4, '16:00'), 'Park entrance', null, array[pg_temp.id('jordan')]) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan']) n;
update profiles p set display_name = initcap(n) from unnest(array['maya','jordan']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key)
  values (pg_temp.id('g'), 'Crew', pg_temp.id('maya'), pg_temp.id('g'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('g'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','jordan']) n;
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('sketch'), 'Sketch and stroll', 'Arts', 'free', 'flexible', 'PLACEHOLDER: test');

select has_column('public', 'plans', 'repeat_rule', 'A plan carries a repeat rule');
select has_function('public', 'set_repeat', array['uuid', 'text'], 'set_repeat has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.set_repeat(uuid,text)', 'EXECUTE'), 'Signed-out clients cannot set a repeat');
select ok(not has_function_privilege('authenticated', 'public.notify_plan_again()', 'EXECUTE'),
  'Clients cannot run the reminder job');
select ok('plan_again' = any (private.notification_kinds()), 'Plan again is a notification kind');
select ok('nudge' <> all (private.notification_kinds()) and 'organizer_nudge' = any (private.notification_kinds()),
  'The earlier kinds are still there');

-- Each rule gives the right next date, counted on the Chicago wall clock.
select is(private.next_repeat_at('2026-11-20 19:00-06', 'weekly'), '2026-11-27 19:00-06'::timestamptz, 'Weekly is 7 days on');
select is(private.next_repeat_at('2026-11-20 19:00-06', 'every_2_weeks'), '2026-12-04 19:00-06'::timestamptz,
  'Every 2 weeks is 14 days on');
select is(private.next_repeat_at('2026-11-20 19:00-06', 'monthly'), '2026-12-20 19:00-06'::timestamptz, 'Monthly is the same day next month');
select is(private.next_repeat_at('2026-01-31 19:00-06', 'monthly'), '2026-02-28 19:00-06'::timestamptz,
  'Monthly from the 31st lands on the last day of a shorter month');
select is(private.next_repeat_at('2026-12-20 19:00-06', 'monthly'), '2027-01-20 19:00-06'::timestamptz, 'Monthly crosses the year');
select is(private.next_repeat_at('2026-03-07 19:00-06', 'weekly'), '2026-03-14 19:00-05'::timestamptz,
  'Weekly keeps 7 pm across the spring DST change');
select is(private.next_repeat_at('2026-11-20 19:00-06', null), null::timestamptz, 'No rule, no next date');

-- Maya sends plans. Jordan is invited but is not the organizer.
set local role authenticated;
select pg_temp.as_user('maya');
select pg_temp.send('p1');
select pg_temp.send('p2');
select pg_temp.send('p3');
select pg_temp.send('p4');
select pg_temp.as_user('jordan');
select throws_ok($$select public.set_repeat(pg_temp.pid('p1'), 'weekly')$$, '42501', null, 'An invitee cannot set a repeat');
select pg_temp.as_user('maya');
select throws_ok($$select public.set_repeat(pg_temp.id('nothing'), 'weekly')$$, '42501', null, 'An unknown plan looks like not the organizer');
select throws_ok($$select public.set_repeat(pg_temp.pid('p1'), 'daily')$$, 'P0001', 'invalid_repeat_rule', 'Daily is not a rule');
select lives_ok($$select public.set_repeat(pg_temp.pid('p1'), 'weekly')$$, 'Maya sets weekly');
reset role;
select is((select repeat_rule from plans where id = pg_temp.pid('p1')), 'weekly', 'The rule is saved');
select ok(not exists (select 1 from plans where id = pg_temp.pid('p2') and repeat_rule is not null), 'Other plans do not repeat');
select is((select count(*) from plans), 4::bigint, 'No plan or draft was created');

-- The reminder: nothing before the window, then once.
select pg_temp.start_in('p1', interval '-1 day');  -- weekly: next date in 6 days, window open
select is(public.notify_plan_again(), 1, 'The job writes one reminder');
select is((select string_agg(user_id::text, ',') from notification_log where kind = 'plan_again'),
  pg_temp.id('maya')::text, 'It goes to the organizer');
select is(public.notify_plan_again(), 0, 'Running the job again writes nothing');
select is(pg_temp.reminders('p1'), 1::bigint, 'The reminder is written once');
select is((select sent_at from notification_log where kind = 'plan_again'), null::timestamptz, 'It waits for the sender');

-- Monthly with the next date weeks away: window not open. Weekly with the next date already past: nothing.
set local role authenticated;
select pg_temp.as_user('maya');
select public.set_repeat(pg_temp.pid('p2'), 'monthly');
reset role;
select pg_temp.start_in('p2', interval '-1 day');
select is(public.notify_plan_again(), 0, 'A next date more than 7 days away gets no reminder yet');
set local role authenticated;
select pg_temp.as_user('maya');
select public.set_repeat(pg_temp.pid('p2'), 'weekly');
reset role;
select pg_temp.start_in('p2', interval '-10 days');
select is(public.notify_plan_again(), 0, 'A next date already past gets no reminder');
select pg_temp.start_in('p2', interval '-27 days');  -- monthly would be in the window, but the rule is weekly
select is(pg_temp.reminders('p2'), 0::bigint, 'Still nothing for that plan');

-- Cancelled plan: the unsent reminder is dropped and nothing new is written.
set local role authenticated;
select pg_temp.as_user('maya');
select public.set_repeat(pg_temp.pid('p3'), 'weekly');
reset role;
select pg_temp.start_in('p3', interval '-1 day');
select is(public.notify_plan_again(), 1, 'A repeating plan gets its reminder');
select pg_temp.start_in('p3', interval '4 days');  -- cancelling is only possible before the plan starts
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.cancel_plan(pg_temp.pid('p3'), 'Rained out')$$, 'Maya cancels the plan');
reset role;
select is(pg_temp.reminders('p3'), 0::bigint, 'Cancelling drops the reminder that was waiting');
select is(public.notify_plan_again(), 0, 'A cancelled plan gets no reminder');
set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select public.set_repeat(pg_temp.pid('p3'), 'weekly')$$, 'P0001', 'plan_cancelled', 'A cancelled plan cannot repeat');
select throws_ok($$select public.set_repeat(pg_temp.pid('p3'), null)$$, 'P0001', 'plan_cancelled', 'Nor be changed');

-- Cleared rule: the waiting reminder is dropped and nothing new is written.
select public.set_repeat(pg_temp.pid('p4'), 'every_2_weeks');
reset role;
select pg_temp.start_in('p4', interval '-8 days');  -- every 2 weeks: next date in 6 days
select is(public.notify_plan_again(), 1, 'A plan repeating every 2 weeks gets its reminder');
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.set_repeat(pg_temp.pid('p4'), null)$$, 'Maya clears the repeat');
reset role;
select is((select repeat_rule from plans where id = pg_temp.pid('p4')), null::text, 'The rule is gone');
select is(pg_temp.reminders('p4'), 0::bigint, 'Clearing drops the reminder that was waiting');
select is(public.notify_plan_again(), 0, 'A cleared rule writes nothing');

-- A reminder that already went out stays as the record; setting a new rule gives a new date and a new reminder.
select pg_temp.start_in('p1', interval '-1 day');
update notification_log set sent_at = now() where kind = 'plan_again' and plan_id = pg_temp.pid('p1');
set local role authenticated;
select pg_temp.as_user('maya');
select public.set_repeat(pg_temp.pid('p1'), 'every_2_weeks');
reset role;
select is(pg_temp.reminders('p1'), 1::bigint, 'A reminder already sent is kept');
select pg_temp.start_in('p1', interval '-9 days');  -- every 2 weeks: next date in 5 days, not the 6 of the first reminder
select is(public.notify_plan_again(), 1, 'A new rule gives a reminder for its own date');
select is(pg_temp.reminders('p1'), 2::bigint, 'Both are on record');

-- Maya can turn the reminder off like any other kind.
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.set_notification_pref('plan_again', false)$$, 'Plan again can be turned off');
select public.set_repeat(pg_temp.pid('p4'), 'weekly');
reset role;
select pg_temp.start_in('p4', interval '-1 day');
select is(public.notify_plan_again(), 0, 'Someone who turned it off is not written a reminder');

select * from finish();
rollback;
