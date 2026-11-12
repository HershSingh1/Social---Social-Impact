-- TEC-102 access rules. Runs after core (…000100) and get_profile_cards (…000500) migrations.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function public.uid_of(text) returns uuid language sql immutable as 'select md5($1)::uuid';

-- alice+carol share group A; bob is alone in B; dana is only on alice's sent plan;
-- gone left A; blk was removed from A (blocked); eve is unconnected; fay is only on a draft plan.
-- Group C: eve is named owner but her own membership ended, and blk is blocked there too.
insert into auth.users (id) select uid_of(n) from unnest(array['alice','bob','carol','dana','gone','blk','eve','fay']) n;
-- The sign-up trigger (TEC-26) already created a profile row per auth user; fill them in.
update profiles p set display_name = initcap(n), avatar_path = n || '.png', budget_cap = 30, transport = 'car'
  from unnest(array['alice','bob','carol','dana','gone','blk','eve','fay']) n
  where p.id = uid_of(n);
insert into groups (id, name, owner_id, client_key) values
  (uid_of('a'), 'Group A', uid_of('alice'), uid_of('a')),
  (uid_of('b'), 'Group B', uid_of('bob'), uid_of('b')),
  (uid_of('c'), 'Group C', uid_of('eve'), uid_of('c'));
insert into group_members (group_id, user_id, role, removed_at, blocked) values
  (uid_of('a'), uid_of('alice'), 'owner', null, false),
  (uid_of('a'), uid_of('carol'), 'member', null, false),
  (uid_of('a'), uid_of('gone'), 'member', now(), false),
  (uid_of('a'), uid_of('blk'), 'member', now(), true),
  (uid_of('b'), uid_of('bob'), 'owner', null, false),
  (uid_of('c'), uid_of('eve'), 'owner', now(), false),
  (uid_of('c'), uid_of('blk'), 'member', now(), true);
insert into plans (id, group_id, organizer_id, experience_name, experience_category, state, current_revision, client_key) values
  (uid_of('sent'), uid_of('a'), uid_of('alice'), 'V', 'Outdoors', 'sent', 1, uid_of('sent')),
  (uid_of('draft'), uid_of('a'), uid_of('alice'), 'V', 'Outdoors', 'draft', 1, uid_of('draft'));
insert into plan_revisions select p, 1, now() + interval '1 day', now() + interval '2 days',
  'America/Chicago', 'Entrance', null, '{"kind":"free"}', false
  from unnest(array[uid_of('sent'), uid_of('draft')]) p;
insert into rsvps values
  (uid_of('sent'), uid_of('alice'), 'going', 1, null),
  (uid_of('sent'), uid_of('dana'), 'awaiting', 1, null),
  (uid_of('sent'), uid_of('gone'), 'awaiting', 1, now()),
  (uid_of('draft'), uid_of('alice'), 'going', 1, null),
  (uid_of('draft'), uid_of('fay'), 'awaiting', 1, null);
set constraints all immediate;

create table public.all_ids as
  select array_agg(uid_of(n)) as ids from unnest(array['alice','bob','carol','dana','gone','blk','eve','fay']) n;
grant select on public.all_ids to authenticated;
grant execute on function public.uid_of(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', uid_of('alice')::text, true);
select set_eq($$select user_id from get_profile_cards((select ids from all_ids))$$,
  $$select uid_of(n) from unnest(array['alice','carol','dana','blk']) n$$,
  'Alice sees herself, a group-mate, a plan invitee and the member she removed');
select ok(exists (select 1 from get_profile_cards(array[uid_of('carol')])
  where display_name = 'Carol' and avatar_path = 'carol.png'), 'Group-mate name and avatar returned');
select is((select count(*)::int from get_profile_cards(array[uid_of('bob')])), 0, 'Stranger in another group returns nothing');
select is((select count(*)::int from get_profile_cards(array[uid_of('eve')])), 0, 'Unconnected user returns nothing');
select is((select count(*)::int from get_profile_cards(array[uid_of('gone')])), 0, 'Member who left returns nothing');
select ok(exists (select 1 from get_profile_cards(array[uid_of('blk')])
  where display_name = 'Blk' and avatar_path = 'blk.png'), 'Owner sees the name and avatar of a member she removed');
select is((select count(*)::int from get_profile_cards(array[uid_of('fay')])), 0, 'Draft-only invitee returns nothing');
select is((select count(*)::int from get_profile_cards(null)), 0, 'Null list returns nothing');
select results_eq($$select to_jsonb(c)::text from get_profile_cards(array[uid_of('carol')]) c$$,
  $$select jsonb_build_object('user_id', uid_of('carol'), 'display_name', 'Carol', 'avatar_path', 'carol.png')::text$$,
  'Row has only user_id, display_name, avatar_path');
select throws_ok($$select budget_cap from get_profile_cards(array[uid_of('carol')])$$, '42703', null, 'budget_cap is not exposed');
select throws_ok($$select transport from get_profile_cards(array[uid_of('carol')])$$, '42703', null, 'transport is not exposed');
select is((select count(*)::int from profiles where id = uid_of('carol')), 0, 'Direct read of another profile stays blocked');

select set_config('request.jwt.claim.sub', uid_of('carol')::text, true);
select is((select count(*)::int from get_profile_cards(array[uid_of('blk')])), 0, 'A regular member does not see a removed member');

select set_config('request.jwt.claim.sub', uid_of('eve')::text, true);
select is((select count(*)::int from get_profile_cards(array[uid_of('blk')])), 0, 'An owner who is no longer an active member does not see removed members');

select set_config('request.jwt.claim.sub', uid_of('blk')::text, true);
select is((select count(*)::int from get_profile_cards(array[uid_of('alice'), uid_of('carol')])), 0, 'The removed member sees no one from the old group');

select set_config('request.jwt.claim.sub', uid_of('bob')::text, true);
select is((select count(*)::int from get_profile_cards(array[uid_of('blk')])), 0, 'Another group owner does not see someone removed elsewhere');
select is((select count(*)::int from get_profile_cards(array[uid_of('alice'), uid_of('carol')])), 0, 'Bob cannot read Group A members');

select set_config('request.jwt.claim.sub', uid_of('dana')::text, true);
select ok(exists (select 1 from get_profile_cards(array[uid_of('alice')])), 'Invitee sees the plan organizer');
select is((select count(*)::int from get_profile_cards(array[uid_of('carol')])), 0, 'Invitee does not see an unrelated group member');

select set_config('request.jwt.claim.sub', uid_of('gone')::text, true);
select is((select count(*)::int from get_profile_cards(array[uid_of('alice'), uid_of('carol')])), 0, 'Removed member sees no one from the old group');

-- Allow back clears blocked; the owner no longer sees them until they rejoin.
reset role;
update group_members set blocked = false where group_id = uid_of('a') and user_id = uid_of('blk');
set local role authenticated;
select set_config('request.jwt.claim.sub', uid_of('alice')::text, true);
select is((select count(*)::int from get_profile_cards(array[uid_of('blk')])), 0, 'After Allow back the owner no longer sees them');

-- An archived group has no owner, so nobody sees its removed members.
reset role;
update group_members set blocked = true where group_id = uid_of('a') and user_id = uid_of('blk');
update groups set owner_id = null, archived_at = now() where id = uid_of('a');
set local role authenticated;
select is((select count(*)::int from get_profile_cards(array[uid_of('blk')])), 0, 'Archived group: former owner sees no removed members');

select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from get_profile_cards(array[uid_of('alice')])), 0, 'No signed-in user returns nothing');
reset role;

select ok(not has_function_privilege('anon', 'public.get_profile_cards(uuid[])', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('public', 'public.get_profile_cards(uuid[])', 'execute'), 'PUBLIC cannot execute');
select ok(has_function_privilege('authenticated', 'public.get_profile_cards(uuid[])', 'execute'), 'authenticated can execute');
select * from finish();
rollback;
