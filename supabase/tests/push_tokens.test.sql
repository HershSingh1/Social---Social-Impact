begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;

insert into auth.users (id)
  select pg_temp.id(n) from unnest(array['alice','bob','nameless']) n;
update profiles set display_name = 'Named user' where id <> pg_temp.id('nameless');

select has_table('public', 'push_tokens', 'Push tokens table exists');
select has_table('public', 'notification_prefs', 'Notification prefs table exists');
select has_function('public', 'register_push_token', array['text','text'], 'Register RPC has the agreed arguments');
select has_function('public', 'remove_push_token', array['text'], 'Remove RPC has the agreed arguments');
select has_function('public', 'set_notification_pref', array['text','boolean'], 'Pref RPC has the agreed arguments');
select ok(has_table_privilege('authenticated', 'public.push_tokens', 'SELECT')
  and has_table_privilege('authenticated', 'public.notification_prefs', 'SELECT'),
  'Clients can read their rows under RLS');
select ok(not has_table_privilege('authenticated', 'public.push_tokens', 'INSERT')
  and not has_table_privilege('authenticated', 'public.push_tokens', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.push_tokens', 'DELETE')
  and not has_table_privilege('authenticated', 'public.notification_prefs', 'INSERT')
  and not has_table_privilege('authenticated', 'public.notification_prefs', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notification_prefs', 'DELETE'),
  'Clients cannot write either table directly');
select ok(not has_function_privilege('anon', 'public.register_push_token(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.remove_push_token(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_notification_pref(text,boolean)', 'EXECUTE'),
  'Signed-out clients cannot call any of them');

set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$select public.register_push_token('token-phone-1', 'ios')$$, 'Alice registers her phone');
select lives_ok($$select public.register_push_token('token-phone-1', 'ios')$$, 'Registering again is accepted');
select is((select count(*) from push_tokens), 1::bigint, 'Registering twice leaves one row');
select lives_ok($$select public.register_push_token('token-phone-2', 'ios')$$, 'Alice registers a second phone');
select is((select count(*) from push_tokens), 2::bigint, 'One person can hold several tokens');
select throws_ok($$insert into push_tokens (user_id, token, platform)
    values (pg_temp.id('alice'), 'direct', 'ios')$$, '42501', null, 'Direct client insert is rejected');
select throws_ok($$select public.register_push_token('', 'ios')$$,
  '22023', 'invalid_token', 'An empty token is refused');
select throws_ok($$select public.register_push_token(null, 'ios')$$,
  '22023', 'invalid_token', 'A missing token is refused');
select throws_ok($$select public.register_push_token('token-x', 'windows')$$,
  '22023', 'invalid_platform', 'An unknown platform is refused');

-- Bob signs in on Alice's first phone.
select pg_temp.as_user('bob');
select is((select count(*) from push_tokens), 0::bigint, 'Bob cannot read Alice''s tokens');
select lives_ok($$select public.register_push_token('token-phone-1', 'ios')$$, 'Bob registers the same phone');
select is((select count(*) from push_tokens where token = 'token-phone-1'), 1::bigint, 'Bob sees his token');
select lives_ok($$select public.remove_push_token('token-phone-2')$$, 'Removing a token Bob does not hold is accepted');

select pg_temp.as_user('alice');
select is((select count(*) from push_tokens where token = 'token-phone-1'), 0::bigint,
  'The token moved to Bob and is no longer Alice''s');
select is((select count(*) from push_tokens where token = 'token-phone-2'), 1::bigint,
  'Bob removing that token did not touch Alice''s second phone');
select lives_ok($$select public.remove_push_token('token-phone-2')$$, 'Alice removes her own token');
select is((select count(*) from push_tokens), 0::bigint, 'Her token is gone');
select lives_ok($$select public.remove_push_token('token-phone-2')$$, 'Removing it again is accepted');

select pg_temp.as_user('bob');
select is((select count(*) from push_tokens where token = 'token-phone-1'), 1::bigint,
  'Alice removing tokens never deleted Bob''s');

-- Preferences.
select pg_temp.as_user('alice');
select is((select count(*) from notification_prefs), 0::bigint, 'No rows means every kind is enabled');
select lives_ok($$select public.set_notification_pref('pick_result', false)$$, 'Alice turns off pick results');
select lives_ok($$select public.set_notification_pref('pick_result', false)$$, 'The same switch sent again is accepted');
select is((select count(*) from notification_prefs), 1::bigint, 'Setting twice leaves one row');
select lives_ok($$select public.set_notification_pref('pick_result', true)$$, 'Alice turns it back on');
select is((select enabled from notification_prefs where kind = 'pick_result'), true, 'The row holds the latest value');
select lives_ok($$select public.set_notification_pref('plan_sent', false)$$, 'Alice turns off plan sent');
select is((select count(*) from notification_prefs), 2::bigint, 'Other kinds are separate rows');
select throws_ok($$select public.set_notification_pref('weekly_digest', true)$$,
  '22023', 'unknown_kind', 'An unknown kind is rejected');
select throws_ok($$select public.set_notification_pref(null, true)$$,
  '22023', 'unknown_kind', 'A missing kind is rejected');
select throws_ok($$select public.set_notification_pref('plan_sent', null)$$,
  '22023', 'invalid_enabled', 'A missing switch value is rejected');
select throws_ok($$insert into notification_prefs (user_id, kind, enabled)
    values (pg_temp.id('alice'), 'nudge', false)$$, '42501', null, 'Direct client insert is rejected');

select pg_temp.as_user('bob');
select is((select count(*) from notification_prefs), 0::bigint, 'Bob cannot read Alice''s prefs');
select lives_ok($$select public.set_notification_pref('plan_sent', true)$$, 'Bob sets his own');
select is((select count(*) from notification_prefs), 1::bigint, 'Bob sees only his row');

select pg_temp.as_user('alice');
select is((select enabled from notification_prefs where kind = 'plan_sent'), false,
  'Bob''s switch did not change Alice''s');

select pg_temp.as_user('nameless');
select throws_ok($$select public.register_push_token('token-n', 'ios')$$,
  'P0001', 'profile_required', 'A completed profile is required to register');
select throws_ok($$select public.set_notification_pref('plan_sent', true)$$,
  'P0001', 'profile_required', 'A completed profile is required for prefs');

reset role;
select is((select array_length(private.notification_kinds(), 1)), 8, 'There are eight kinds');
delete from profiles where id = pg_temp.id('alice');
select is((select count(*) from push_tokens where user_id = pg_temp.id('alice'))
  + (select count(*) from notification_prefs where user_id = pg_temp.id('alice')), 0::bigint,
  'Deleting a profile deletes its tokens and prefs');

select * from finish();
rollback;
