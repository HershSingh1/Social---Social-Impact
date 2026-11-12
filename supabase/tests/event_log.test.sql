begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['ann','bob','nameless']) n;
update profiles set display_name = id::text where id <> pg_temp.id('nameless');

select has_function('public', 'log_event', array['text','jsonb'], 'log_event has the agreed arguments');
select ok(not has_function_privilege('anon', 'public.log_event(text,jsonb)', 'EXECUTE'), 'Signed-out clients cannot log');
select ok(not has_table_privilege('authenticated', 'public.events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.events', 'DELETE'), 'Clients have no direct access to events');

set local role authenticated;
select pg_temp.as_user('ann');
select lives_ok($$select log_event('plan_sent', jsonb_build_object('plan_id', pg_temp.id('p'), 'group_id', pg_temp.id('g'), 'surface', 'review'))$$, 'A plan_sent event is accepted');
select lives_ok($$select log_event('vote_cast', jsonb_build_object('option_id', pg_temp.id('o'), 'value', 'maybe'))$$, 'A vote_cast event is accepted');
select lives_ok($$select log_event('plan_edited', jsonb_build_object('plan_id', pg_temp.id('p'), 'material', true, 'changed', jsonb_build_array('start_local', 'note')))$$, 'A plan_edited event is accepted');
select lives_ok($$select log_event('rsvp_saved', jsonb_build_object('plan_id', pg_temp.id('p'), 'status', 'going'))$$, 'An rsvp_saved event is accepted');
select lives_ok($$select log_event(n, '{}') from unnest(array['experience_viewed','pick_created','pick_closed','plan_drafted','invite_viewed','plan_cancelled']) n$$, 'The other events are accepted');
select throws_ok($$select log_event('page_scrolled', '{}')$$, 'P0001', 'unknown_event', 'An unlisted event name is refused');
select throws_ok($$select log_event(null, '{}')$$, 'P0001', 'unknown_event', 'A missing name is refused');
select throws_ok($$select count(*) from events$$, '42501', null, 'Ann cannot read events, not even her own');
select pg_temp.as_user('nameless');
select throws_ok($$select log_event('plan_sent', '{}')$$, 'P0001', 'profile_required', 'A finished profile is required');

-- Forbidden fields are never stored, under any key or in any value
select pg_temp.as_user('bob');
select lives_ok($$select log_event('plan_sent', jsonb_build_object(
    'plan_id', pg_temp.id('p2'),
    'note', 'Bring cash for the SECRETNOTE',
    'contacts', jsonb_build_array('+15125550100', 'maya@example.com'),
    'contact_name', 'Jordan Q Public',
    'calendar', 'Dentist at 3pm',
    'budget', 25, 'budget_cap', 40,
    'photo', 'https://x.test/me.jpg',
    'invite_code', 'ABC234', 'code', 'ABC234', 'join_code', 'XYZ789',
    'meeting_point', 'Behind the SECRETNOTE tree',
    'user_id', pg_temp.id('ann')))$$, 'An event carrying forbidden fields is still accepted, minus the fields');
select lives_ok($$select log_event('invite_viewed', jsonb_build_object('plan_id', 'ABC234', 'surface', 'ABC234', 'value', 'ABC234', 'experience_id', 'not-a-uuid'))$$,
  'An invite code in an allowed key is accepted');
select lives_ok($$select log_event('plan_edited', jsonb_build_object('changed', jsonb_build_array('note', 'Bring cash'), 'material', 'yes'))$$,
  'Field contents in changed are accepted');
reset role;
select is((select props from events where user_id = pg_temp.id('bob') and name = 'plan_sent'), jsonb_build_object('plan_id', pg_temp.id('p2')),
  'Only the allowed key survives');
select is((select count(*) from events where props::text ~* '(SECRETNOTE|5125550100|example\.com|Jordan|Dentist|ABC234|XYZ789|me\.jpg|budget|cash)'), 0::bigint,
  'No forbidden text appears anywhere in the stored events');
select is((select props from events where user_id = pg_temp.id('bob') and name = 'invite_viewed'), '{}'::jsonb, 'Wrong-shaped values are dropped with their keys');
select is((select props from events where user_id = pg_temp.id('bob') and name = 'plan_edited'), '{}'::jsonb, 'Free text in changed and a non-boolean material are dropped');
select is((select props from events where user_id = pg_temp.id('ann') and name = 'plan_edited'),
  jsonb_build_object('plan_id', pg_temp.id('p'), 'material', true, 'changed', jsonb_build_array('start_local', 'note')), 'Field names and flags are kept');
select ok((select bool_and(user_id = pg_temp.id('bob')) from events where props ? 'plan_id' and props ->> 'plan_id' = pg_temp.id('p2')::text),
  'The event belongs to the caller, whatever user_id the props claimed');
select is((select count(*) from events where user_id = pg_temp.id('ann')), 10::bigint, 'Ann logged ten events');

-- Deleting the account keeps the count and drops the person
delete from profiles where id = pg_temp.id('ann');
select is((select count(*) from events where user_id is null), 10::bigint, 'Events outlive the account without a user_id');

-- The hourly cap drops events quietly
insert into events (user_id, name) select pg_temp.id('bob'), 'plan_sent' from generate_series(1, 1000);
set local role authenticated;
select pg_temp.as_user('bob');
select lives_ok($$select log_event('plan_sent', '{}')$$, 'Past the cap, logging does not fail');
reset role;
select is((select count(*) from events where user_id = pg_temp.id('bob') and created_at > now() - interval '1 hour'), 1003::bigint, 'Past the cap, nothing more is stored');

select * from finish();
rollback;
