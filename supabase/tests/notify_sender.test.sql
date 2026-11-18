begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan','sam','riley']) n;
update profiles p set display_name = initcap(n) from unnest(array['maya','jordan','sam','riley']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'Saturday crew', pg_temp.id('maya'), pg_temp.id('g'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('g'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end from unnest(array['maya','jordan','sam','riley']) n;
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('sketch'), 'Sketch and stroll', 'Arts', 'free', 'flexible', 'PLACEHOLDER: test');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('plan'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('sketch'), 'Sketch and stroll', 'Arts', 'draft', 2, pg_temp.id('plan'));
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required) values
  (pg_temp.id('plan'), 1, '2026-12-05 20:00+00', '2026-12-05 22:00+00', 'Park', '{}', false),
  (pg_temp.id('plan'), 2, '2026-12-05 21:00+00', '2026-12-05 23:00+00', 'Park', '{}', false);
insert into picks (id, group_id, organizer_id, client_key, title, deadline)
  values (pg_temp.id('pick'), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('pick'), 'What should we do this weekend?', '2026-12-07 15:12+00');
insert into pick_options (id, pick_id, experience_id, position) values (pg_temp.id('opt'), pg_temp.id('pick'), pg_temp.id('sketch'), 1);
update picks set winner_option_id = pg_temp.id('opt') where id = pg_temp.id('pick');
delete from notification_log; -- whatever the triggers wrote; this test sets up its own rows
insert into push_tokens (user_id, token, platform, created_at) values
  (pg_temp.id('jordan'), 'ExponentPushToken[j1]', 'ios', now() - interval '2 days'),
  (pg_temp.id('jordan'), 'ExponentPushToken[j2]', 'ios', now() - interval '1 day'),
  (pg_temp.id('sam'), 'ExponentPushToken[s1]', 'ios', now());
-- Riley has no token.

-- Only the service role may run the sender's functions.
select ok(not has_function_privilege('authenticated', 'public.claim_notifications(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_notifications(integer)', 'EXECUTE'), 'Clients cannot claim rows');
select ok(not has_function_privilege('authenticated', 'public.mark_notifications_sent(uuid[])', 'EXECUTE'), 'Clients cannot mark rows sent');
select ok(not has_function_privilege('authenticated', 'public.remove_invalid_push_tokens(text[])', 'EXECUTE'), 'Clients cannot remove tokens');
select ok(not has_function_privilege('authenticated', 'private.invoke_notify()', 'EXECUTE'), 'Clients cannot wake the sender');
select lives_ok($$select private.invoke_notify()$$, 'Waking the sender is a no-op without Vault and pg_net');
select throws_ok('select * from public.claim_notifications(0)', '22023', 'invalid_batch_size', 'Batch size must be positive');

-- Rows the sender will see.
insert into notification_log (id, event_key, user_id, kind, plan_id, pick_id, created_at) values
  (pg_temp.id('r1'), 'plan_sent:a', pg_temp.id('jordan'), 'plan_sent', pg_temp.id('plan'), null, now() - interval '5 minutes'),
  (pg_temp.id('r2'), 'pick_opened:a', pg_temp.id('sam'), 'pick_opened', null, pg_temp.id('pick'), now() - interval '4 minutes'),
  (pg_temp.id('r3'), 'pick_closing:a', pg_temp.id('jordan'), 'pick_closing', null, pg_temp.id('pick'), now() - interval '3 minutes'),
  (pg_temp.id('r4'), 'pick_result:a', pg_temp.id('sam'), 'pick_result', null, pg_temp.id('pick'), now() - interval '2 minutes'),
  (pg_temp.id('r5'), 'material_change:a', pg_temp.id('jordan'), 'material_change', pg_temp.id('plan'), null, now() - interval '1 minute'),
  (pg_temp.id('r6'), 'plan_sent:b', pg_temp.id('riley'), 'plan_sent', pg_temp.id('plan'), null, now() - interval '6 minutes'),
  (pg_temp.id('r7'), 'plan_sent:old', pg_temp.id('sam'), 'plan_sent', pg_temp.id('plan'), null, now() - interval '25 hours');

create temp table first_claim as select * from public.claim_notifications(100);
select is((select count(*) from first_claim), 5::bigint, 'Five rows are claimed: not the no-token row, not the 25-hour-old row');
select is((select array_agg(log_id order by log_id) from first_claim),
  (select array_agg(x order by x) from unnest(array[pg_temp.id('r1'), pg_temp.id('r2'), pg_temp.id('r3'), pg_temp.id('r4'), pg_temp.id('r5')]) x),
  'The claimed rows are the ones with a device');
select is((select log_id from public.claim_notifications(1)), null, 'A second claim right away gets nothing: the rows are leased');
select is((select sent_at is not null from notification_log where id = pg_temp.id('r6')), true,
  'A person with no token is settled without sending');
select is((select sent_at is null from notification_log where id = pg_temp.id('r7')), true, 'A row older than 24 hours stays unsent');

-- The pieces of each message.
select is((select actor_name || '|' || subject || '|' || (at_time at time zone 'UTC')::text || '|' || time_zone
  from first_claim where log_id = pg_temp.id('r1')), 'Maya|Sketch and stroll|2026-12-05 21:00:00|America/Chicago', 'Plan sent: organizer, activity, current start');
select is((select subject || '|' || (at_time at time zone 'UTC')::text from first_claim where log_id = pg_temp.id('r2')),
  'What should we do this weekend?|2026-12-07 15:12:00', 'Pick opened: title and deadline');
select is((select group_name from first_claim where log_id = pg_temp.id('r3')), 'Saturday crew', 'Closing reminder: group name');
select is((select subject from first_claim where log_id = pg_temp.id('r4')), 'Sketch and stroll', 'Pick result: the winning activity');
select is((select (at_time at time zone 'UTC')::text || '|' || (prev_at_time at time zone 'UTC')::text from first_claim where log_id = pg_temp.id('r5')),
  '2026-12-05 21:00:00|2026-12-05 20:00:00', 'Material change: new and previous start');
select is((select tokens from first_claim where log_id = pg_temp.id('r1')), array['ExponentPushToken[j2]', 'ExponentPushToken[j1]'],
  'Tokens come back newest first');

-- A lease that has run out makes the row claimable again (the retry after a failure).
update notification_log set claimed_at = now() - interval '11 minutes' where id = pg_temp.id('r3');
select is((select array_agg(log_id) from public.claim_notifications(100)), array[pg_temp.id('r3')], 'An expired lease is claimed again, and only that row');

-- Marking sent takes a row out of the queue for good, and twice does no harm.
select is(public.mark_notifications_sent(array[pg_temp.id('r1'), pg_temp.id('r2')]), 2, 'Two rows marked sent');
select is(public.mark_notifications_sent(array[pg_temp.id('r1'), pg_temp.id('r2')]), 0, 'Marking again changes nothing');
update notification_log set claimed_at = now() - interval '11 minutes';
select is((select array_agg(log_id order by log_id) from public.claim_notifications(100)),
  (select array_agg(x order by x) from unnest(array[pg_temp.id('r3'), pg_temp.id('r4'), pg_temp.id('r5')]) x), 'Sent rows are never claimed again');

-- A batch is oldest first and bounded.
update notification_log set claimed_at = null;
select is((select log_id from public.claim_notifications(1)), pg_temp.id('r3'), 'A batch of one is the oldest unsent row with a device');

-- Dead tokens.
select is(public.remove_invalid_push_tokens(array['ExponentPushToken[j1]', 'ExponentPushToken[nope]']), 1, 'One dead token removed');
select is((select count(*) from push_tokens where user_id = pg_temp.id('jordan')), 1::bigint, 'Jordan keeps his other device');
select is(public.remove_invalid_push_tokens(null), 0, 'A null list removes nothing');

-- The log holds no message text.
select is((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notification_log'
  and column_name not in ('id', 'event_key', 'user_id', 'kind', 'plan_id', 'pick_id', 'created_at', 'sent_at', 'claimed_at')), 0::bigint,
  'The outbox has ids, a kind and timestamps only');
select * from finish();
rollback;
