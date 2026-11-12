begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;

-- Fixture (as superuser). maya is the person who deletes her account.
--   g1: maya owns; zed (oldest active), ann, bob (blocked, oldest of all), rae (removed)  -> zed takes over
--   g2: maya alone                                                                         -> archived
--   g3: ann owns; maya is a plain member                                                   -> unchanged
--   g4: maya owns; zed joined after ann                                                    -> ann takes over
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','zed','ann','bob','rae','stranger']) n;
update profiles set display_name = initcap(replace(id::text, '-', '')) ;
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g1'), 'G1', pg_temp.id('maya'), pg_temp.id('k1')), (pg_temp.id('g2'), 'G2', pg_temp.id('maya'), pg_temp.id('k2')),
  (pg_temp.id('g3'), 'G3', pg_temp.id('ann'),  pg_temp.id('k3')), (pg_temp.id('g4'), 'G4', pg_temp.id('maya'), pg_temp.id('k4'));
insert into group_members (group_id, user_id, role, joined_at, removed_at, blocked) values
  (pg_temp.id('g1'), pg_temp.id('maya'), 'owner',  '2024-01-01', null, false),
  (pg_temp.id('g1'), pg_temp.id('bob'),  'member', '2024-02-01', null, true),
  (pg_temp.id('g1'), pg_temp.id('rae'),  'member', '2024-03-01', now(), false),
  (pg_temp.id('g1'), pg_temp.id('zed'),  'member', '2026-01-01', null, false),
  (pg_temp.id('g1'), pg_temp.id('ann'),  'member', '2026-02-01', null, false),
  (pg_temp.id('g2'), pg_temp.id('maya'), 'owner',  '2024-01-01', null, false),
  (pg_temp.id('g3'), pg_temp.id('ann'),  'owner',  '2024-01-01', null, false),
  (pg_temp.id('g3'), pg_temp.id('maya'), 'member', '2024-06-01', null, false),
  (pg_temp.id('g4'), pg_temp.id('maya'), 'owner',  '2024-01-01', null, false),
  (pg_temp.id('g4'), pg_temp.id('ann'),  'member', '2026-01-10', null, false),
  (pg_temp.id('g4'), pg_temp.id('zed'),  'member', '2026-03-01', null, false);
insert into join_codes (code, group_id, expires_at) values
  ('AAAAAA', pg_temp.id('g1'), now() + interval '14 days'), ('BBBBBB', pg_temp.id('g2'), now() + interval '14 days');
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('e'), 'Clay', 'art', 'free', 'flexible', 'PLACEHOLDER: test');

-- Picks: pk_open / pk_closed / pk_planned are maya's in g1; pk_ann is ann's open pick in g3 (maya votes on it).
insert into picks (id, group_id, organizer_id, client_key, deadline, state) values
  (pg_temp.id('pk_open'),    pg_temp.id('g1'), pg_temp.id('maya'), pg_temp.id('pk1'), now() + interval '1 day', 'open'),
  (pg_temp.id('pk_closed'),  pg_temp.id('g1'), pg_temp.id('maya'), pg_temp.id('pk2'), now() - interval '1 day', 'closed'),
  (pg_temp.id('pk_planned'), pg_temp.id('g1'), pg_temp.id('maya'), pg_temp.id('pk3'), now() - interval '2 day', 'planned'),
  (pg_temp.id('pk_ann'),     pg_temp.id('g3'), pg_temp.id('ann'),  pg_temp.id('pk4'), now() + interval '1 day', 'open');
insert into pick_options (id, pick_id, experience_id, position)
  select pg_temp.id('o_' || p), pg_temp.id(p), pg_temp.id('e'), 1 from unnest(array['pk_open','pk_closed','pk_planned','pk_ann']) p;
insert into option_tallies (option_id, yes, no) values
  (pg_temp.id('o_pk_open'), 1, 1), (pg_temp.id('o_pk_closed'), 1, 1), (pg_temp.id('o_pk_planned'), 1, 0), (pg_temp.id('o_pk_ann'), 1, 1);
insert into votes (option_id, user_id, value)
  select pg_temp.id('o_' || p), pg_temp.id('maya'), 'yes' from unnest(array['pk_open','pk_closed','pk_planned','pk_ann']) p;
insert into votes (option_id, user_id, value)
  select pg_temp.id('o_' || p), pg_temp.id('ann'), 'no' from unnest(array['pk_open','pk_closed','pk_ann']) p;
insert into pick_voter_status (pick_id, user_id, complete) values
  (pg_temp.id('pk_open'), pg_temp.id('maya'), true), (pg_temp.id('pk_open'), pg_temp.id('ann'), true),
  (pg_temp.id('pk_ann'), pg_temp.id('maya'), true), (pg_temp.id('pk_ann'), pg_temp.id('ann'), true);

-- Plans: p_sent (maya organizes, planned from pk_planned; ann and zed invited), p_draft (maya's unsent draft),
-- p_ann (ann organizes; maya invited), p_cancelled (maya's, already cancelled).
insert into plans (id, group_id, organizer_id, experience_name, experience_category, pick_id, state, current_revision, client_key, cancel_reason) values
  (pg_temp.id('p_sent'),      pg_temp.id('g1'), pg_temp.id('maya'), 'Clay', 'art', pg_temp.id('pk_planned'), 'sent',      1, pg_temp.id('c1'), null),
  (pg_temp.id('p_draft'),     pg_temp.id('g1'), pg_temp.id('maya'), 'Clay', 'art', null,                     'draft',     1, pg_temp.id('c2'), null),
  (pg_temp.id('p_ann'),       pg_temp.id('g3'), pg_temp.id('ann'),  'Clay', 'art', null,                     'sent',      1, pg_temp.id('c3'), null),
  (pg_temp.id('p_cancelled'), pg_temp.id('g1'), pg_temp.id('maya'), 'Clay', 'art', null,                     'cancelled', 1, pg_temp.id('c4'), 'Rain');
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
  select pg_temp.id(p), 1, now() + interval '2 days', now() + interval '2 days 2 hours', 'Door', '{}', false
  from unnest(array['p_sent','p_draft','p_ann','p_cancelled']) p;
insert into rsvps (plan_id, user_id, status, revision) values
  (pg_temp.id('p_sent'), pg_temp.id('maya'), 'going', 1), (pg_temp.id('p_sent'), pg_temp.id('ann'), 'going', 1),
  (pg_temp.id('p_sent'), pg_temp.id('zed'), 'awaiting', 1), (pg_temp.id('p_draft'), pg_temp.id('maya'), 'going', 1),
  (pg_temp.id('p_ann'), pg_temp.id('ann'), 'going', 1), (pg_temp.id('p_ann'), pg_temp.id('maya'), 'going', 1),
  (pg_temp.id('p_cancelled'), pg_temp.id('maya'), 'going', 1), (pg_temp.id('p_cancelled'), pg_temp.id('ann'), 'going', 1);
insert into private.send_plan_requests (client_key, user_id, plan_id, payload_hash)
  values (pg_temp.id('c1'), pg_temp.id('maya'), pg_temp.id('p_sent'), 'h');
insert into join_attempts (user_id, window_start, attempts) values (pg_temp.id('maya'), now(), 2);

-- Contract
select has_function('public', 'delete_account', array[]::text[], 'delete_account() exists');
select ok(not has_function_privilege('anon', 'public.delete_account()', 'execute'), 'anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.delete_account()', 'execute'), 'authenticated can execute');

-- Guards
set local role authenticated;
select throws_ok($$select public.delete_account()$$, '28000', 'not_authenticated', 'Signed out rejected');
select pg_temp.as_user('maya', true);
select throws_ok($$select public.delete_account()$$, '28000', 'not_authenticated', 'Anonymous JWT rejected');
reset role;
select is((select count(*) from profiles where id = pg_temp.id('maya')), 1::bigint, 'Rejected calls delete nothing');

-- Delete
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.delete_account()$$, 'maya deletes her account');
select lives_ok($$select public.delete_account()$$, 'Calling it again is a no-op');
reset role;
select lives_ok($$set constraints all immediate$$, 'No deferred foreign key is left broken');

-- Personal data is gone, and the auth user with it
select is((select count(*) from profiles where id = pg_temp.id('maya')), 0::bigint, 'Profile removed');
select is((select count(*) from auth.users where id = pg_temp.id('maya')), 0::bigint, 'Auth user removed');
select is((select count(*) from votes where user_id = pg_temp.id('maya')), 0::bigint, 'Votes removed');
select is((select count(*) from rsvps where user_id = pg_temp.id('maya')), 0::bigint, 'RSVPs removed');
select is((select count(*) from group_members where user_id = pg_temp.id('maya')), 0::bigint, 'Memberships removed');
select is((select count(*) from pick_voter_status where user_id = pg_temp.id('maya')), 0::bigint, 'Voter status removed');
select is((select count(*) from join_attempts where user_id = pg_temp.id('maya')), 0::bigint, 'Join-code counters removed');
select is((select count(*) from private.send_plan_requests where user_id = pg_temp.id('maya')), 0::bigint, 'Send-plan requests removed');
select is((select count(*) from profiles), 5::bigint, 'Nobody else is deleted');

-- Owned groups (G8)
select is((select owner_id from groups where id = pg_temp.id('g1')), pg_temp.id('zed'),
  'g1 goes to the longest-standing active member (not blocked bob or removed rae)');
select is((select role from group_members where group_id = pg_temp.id('g1') and user_id = pg_temp.id('zed')), 'owner', 'New owner has the owner role');
select is((select count(*) from group_members where group_id = pg_temp.id('g1') and role = 'owner'), 1::bigint, 'Exactly one owner in g1');
select is((select archived_at is null from groups where id = pg_temp.id('g1')), true, 'g1 stays active');
select is((select owner_id from groups where id = pg_temp.id('g4')), pg_temp.id('ann'), 'g4 goes to its own earliest member');
select ok((select owner_id is null and archived_at is not null from groups where id = pg_temp.id('g2')), 'g2 (nobody else) is archived with no owner');
select ok((select revoked_at is not null from join_codes where code = 'BBBBBB'), 'Archived group join code is closed');
select ok((select revoked_at is null from join_codes where code = 'AAAAAA'), 'Surviving group join code is untouched');
select is((select owner_id from groups where id = pg_temp.id('g3')), pg_temp.id('ann'), 'A group maya only belonged to is untouched');

-- Plans
select is((select state || '|' || cancel_reason from plans where id = pg_temp.id('p_sent')),
  'cancelled|Organizer deleted their account', 'Sent plan is cancelled with the reason');
select is((select organizer_id from plans where id = pg_temp.id('p_sent')), null, 'Cancelled plan keeps its row without an organizer');
select is((select cancel_reason from plans where id = pg_temp.id('p_cancelled')), 'Rain', 'Already-cancelled plan keeps its own reason');
select is((select count(*) from plans where id = pg_temp.id('p_draft')), 0::bigint, 'Unsent draft deleted');
select is((select count(*) from plan_revisions where plan_id = pg_temp.id('p_draft')), 0::bigint, 'Draft revisions deleted');
select is((select state from plans where id = pg_temp.id('p_ann')), 'sent', 'Another organizer plan stays sent');
select is((select count(*) from rsvps where plan_id = pg_temp.id('p_ann')), 1::bigint, 'Only maya RSVP removed from that plan');
select is((select status from rsvps where plan_id = pg_temp.id('p_sent') and user_id = pg_temp.id('ann')), 'going', 'Invitee answers are kept');

-- Picks and votes
select is((select state from picks where id = pg_temp.id('pk_open')), 'cancelled', 'Open pick she organized is cancelled');
select is((select state from picks where id = pg_temp.id('pk_closed')), 'cancelled', 'Closed pick she organized is cancelled');
select is((select state from picks where id = pg_temp.id('pk_planned')), 'planned', 'Planned pick stays planned');
select is((select organizer_id from picks where id = pg_temp.id('pk_planned')), null, 'Picks lose their organizer');
select is((select yes || '/' || no from option_tallies where option_id = pg_temp.id('o_pk_ann')), '0/1', 'Open pick tally recounted without her vote');
select is((select yes || '/' || no from option_tallies where option_id = pg_temp.id('o_pk_closed')), '1/1', 'Closed pick tally still matches its result');
select is((select count(*) from votes where user_id = pg_temp.id('ann')), 3::bigint, 'Other people votes are kept');

-- Invitees see the cancellation reason (RLS, as ann and zed)
set local role authenticated;
select pg_temp.as_user('ann');
select is((select cancel_reason from plans where id = pg_temp.id('p_sent')), 'Organizer deleted their account', 'Invitee ann sees the reason');
select pg_temp.as_user('zed');
select is((select state || '|' || cancel_reason from plans where id = pg_temp.id('p_sent')), 'cancelled|Organizer deleted their account', 'Invitee zed sees the reason');
select is((select count(*) from group_members where group_id = pg_temp.id('g1')), 4::bigint, 'zed reads the g1 roster (as the new owner)');

-- Rows without an organizer cannot be driven by anyone else
select throws_ok($$select public.cancel_pick(pg_temp.id('pk_planned'))$$, 'P0001', 'pick_not_cancellable', 'Nobody can cancel the orphaned planned pick');
select throws_ok($$select public.add_option(pg_temp.id('pk_open'), pg_temp.id('e'))$$, 'P0001', 'voting_closed', 'Nobody can add options to the cancelled pick');
select throws_ok($$select public.edit_plan(pg_temp.id('p_sent'), '{"note":"x"}')$$, 'P0001', 'plan_cancelled', 'Nobody can edit the cancelled plan');
select lives_ok($$select public.close_pick(pg_temp.id('pk_planned'))$$, 'Closing the planned pick changes nothing');
reset role;
select is((select state from picks where id = pg_temp.id('pk_planned')), 'planned', 'Planned pick still planned');

select * from finish();
rollback;
