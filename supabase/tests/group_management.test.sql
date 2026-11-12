begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['owner','member','other','removed','solo','nameless']) n;
update profiles set display_name = id::text where id <> pg_temp.id('nameless');
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'Main group', pg_temp.id('owner'), pg_temp.id('g-key')),
  (pg_temp.id('solo-g'), 'Solo group', pg_temp.id('solo'), pg_temp.id('solo-key'));
insert into group_members (group_id, user_id, role) values
  (pg_temp.id('g'), pg_temp.id('owner'), 'owner'),
  (pg_temp.id('g'), pg_temp.id('member'), 'member'),
  (pg_temp.id('g'), pg_temp.id('other'), 'member'),
  (pg_temp.id('g'), pg_temp.id('removed'), 'member'),
  (pg_temp.id('solo-g'), pg_temp.id('solo'), 'owner');
update group_members set removed_at = now(), blocked = true
  where group_id = pg_temp.id('g') and user_id = pg_temp.id('removed');
insert into join_codes (code, group_id, expires_at) values
  ('AAA234', pg_temp.id('g'), now() + interval '14 days'),
  ('BBB234', pg_temp.id('solo-g'), now() + interval '14 days');

select has_function('public', 'revoke_code', array['uuid'], 'revoke_code exists');
select has_function('public', 'regenerate_code', array['uuid'], 'regenerate_code exists');
select has_function('public', 'remove_member', array['uuid', 'uuid'], 'remove_member exists');
select has_function('public', 'allow_back', array['uuid', 'uuid'], 'allow_back exists');
select has_function('public', 'transfer_owner', array['uuid', 'uuid'], 'transfer_owner exists');
select has_function('public', 'leave_group', array['uuid'], 'leave_group exists');

set local role authenticated;
select pg_temp.as_user('owner');
select lives_ok($$select public.revoke_code(pg_temp.id('g'))$$, 'Owner can revoke the active code');
reset role;
select ok((select revoked_at is not null from join_codes where code = 'AAA234'), 'Revocation marks the code inactive');
set local role authenticated;
select pg_temp.as_user('member');
select is(public.join_group('AAA234') ->> 'error', 'expired', 'Revoked code immediately stops new joins');
reset role;
select ok((select removed_at is null from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('member')),
  'Revoking never removes existing members');

set local role authenticated;
select pg_temp.as_user('owner');
create temp table fresh_code as select public.regenerate_code(pg_temp.id('g')) as result;
grant select on fresh_code to authenticated;
select matches((select result ->> 'code' from fresh_code), '^[A-HJ-NP-Z2-9]{6}$', 'Regenerate returns a valid code');
select ok((select (result ->> 'expires_at')::timestamptz > now() + interval '13 days' from fresh_code), 'New code is valid for 14 days');
reset role;
select is((select count(*) from join_codes where group_id = pg_temp.id('g') and revoked_at is null), 1::bigint, 'Exactly one active code remains');

set local role authenticated;
select pg_temp.as_user('member');
select throws_ok($$select public.revoke_code(pg_temp.id('g'))$$, '42501', 'not_owner', 'Only an owner can revoke');
select throws_ok($$select public.regenerate_code(pg_temp.id('g'))$$, '42501', 'not_owner', 'Only an owner can regenerate');
select throws_ok($$select public.remove_member(pg_temp.id('g'), pg_temp.id('other'))$$, '42501', 'not_owner', 'Only an owner can remove');
select throws_ok($$select public.allow_back(pg_temp.id('g'), pg_temp.id('removed'))$$, '42501', 'not_owner', 'Only an owner can allow back');
select throws_ok($$select public.transfer_owner(pg_temp.id('g'), pg_temp.id('other'))$$, '42501', 'not_owner', 'Only an owner can transfer');
reset role;

set local role authenticated;
select pg_temp.as_user('owner');
select lives_ok($$select public.remove_member(pg_temp.id('g'), pg_temp.id('other'))$$, 'Owner can remove a member');
reset role;
select ok((select removed_at is not null and blocked from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('other')),
  'Removed member is blocked from rejoining');
set local role authenticated;
select pg_temp.as_user('other');
select is(public.join_group((select result ->> 'code' from fresh_code)) ->> 'error', 'blocked', 'Removed member cannot use the new code');
reset role;
set local role authenticated;
select pg_temp.as_user('owner');
select lives_ok($$select public.allow_back(pg_temp.id('g'), pg_temp.id('other'))$$, 'Owner can allow a removed member back');
reset role;
select ok(not (select blocked from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('other')),
  'Allow back clears only the rejoin block');
set local role authenticated;
select pg_temp.as_user('other');
select is(public.join_group((select result ->> 'code' from fresh_code)) ->> 'ok', 'true', 'Allowed-back member can rejoin with the regenerated code');
reset role;

set local role authenticated;
select pg_temp.as_user('owner');
select throws_ok($$select public.remove_member(pg_temp.id('g'), pg_temp.id('owner'))$$, 'P0001', 'cannot_remove_owner', 'Owner cannot remove themself');
select throws_ok($$select public.allow_back(pg_temp.id('g'), pg_temp.id('member'))$$, 'P0001', 'member_not_removed', 'Active members cannot be allowed back');
select throws_ok($$select public.transfer_owner(pg_temp.id('g'), pg_temp.id('removed'))$$, 'P0001', 'member_not_found', 'Ownership cannot go to someone who has left');
select lives_ok($$select public.transfer_owner(pg_temp.id('g'), pg_temp.id('member'))$$, 'Owner can transfer to an active member');
reset role;
select is((select owner_id from groups where id = pg_temp.id('g')), pg_temp.id('member'), 'Group points to the new owner');
select is((select role from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('owner')), 'member', 'Former owner becomes a member');
select is((select role from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('member')), 'owner', 'New owner has owner role');

set local role authenticated;
select pg_temp.as_user('owner');
select lives_ok($$select public.leave_group(pg_temp.id('g'))$$, 'Former owner can leave after transferring');
reset role;
select ok((select removed_at is not null and not blocked from group_members where group_id = pg_temp.id('g') and user_id = pg_temp.id('owner')),
  'Leaving marks membership inactive but rejoinable');
set local role authenticated;
select pg_temp.as_user('member');
select throws_ok($$select public.leave_group(pg_temp.id('g'))$$, 'P0001', 'owner_must_transfer', 'Owner with members must transfer before leaving');
reset role;
set local role authenticated;
select pg_temp.as_user('solo');
select lives_ok($$select public.leave_group(pg_temp.id('solo-g'))$$, 'Sole owner can leave');
reset role;
select ok((select archived_at is not null and owner_id is null from groups where id = pg_temp.id('solo-g')),
  'Sole-owner departure archives the group');
select ok((select revoked_at is not null from join_codes where code = 'BBB234'), 'Archiving revokes the join code');

select ok(not has_function_privilege('anon', 'public.revoke_code(uuid)', 'execute'), 'anon cannot revoke');
select ok(has_function_privilege('authenticated', 'public.leave_group(uuid)', 'execute'), 'authenticated can leave');
select ok(not has_function_privilege('authenticated', 'private.require_group_owner(uuid)', 'execute'), 'Owner helper is private');
set local role authenticated;
select pg_temp.as_user('nameless');
select throws_ok($$select public.leave_group(pg_temp.id('g'))$$, 'P0001', 'profile_required', 'Profile is required');
select pg_temp.as_user('member', true);
select throws_ok($$select public.leave_group(pg_temp.id('g'))$$, '28000', 'not_authenticated', 'Anonymous caller is rejected');
reset role;
select * from finish();
rollback;
