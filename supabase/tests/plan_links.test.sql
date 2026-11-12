begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.counts(p text) returns text language sql as $$
  select going || '/' || awaiting || '/' || cant_go || '/' || needs_reconfirm from private.rsvp_counts(pg_temp.id(p)) $$;
create function pg_temp.tok() returns text language sql as $$ select current_setting('t.tok') $$;

-- Fixture: group G has maya (organizer), a, b, and bl (blocked). o, late and nogroup are outside it.
-- 'nameless' has no profile yet. Plans: p (sent, in two days), pc (cancelled), pe (ended), pd (draft).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','bl','o','late','nameless']) n;
update profiles set display_name = initcap(id::text) where id <> pg_temp.id('nameless');
update profiles set display_name = 'Maya' where id = pg_temp.id('maya');
insert into groups (id, name, owner_id, client_key)
  values (pg_temp.id('g'), 'Saturday crew', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id, role, blocked)
  select pg_temp.id('g'), pg_temp.id(n), case n when 'maya' then 'owner' else 'member' end, n = 'bl'
  from unnest(array['maya','a','b','bl']) n;
insert into experiences (id, name, category, price_kind, timing_kind, source, status)
  values (pg_temp.id('e'), 'Clay', 'art', 'exact', 'flexible', 'PLACEHOLDER: links test', 'published');
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  select pg_temp.id(k), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('e'), 'Clay and conversation', 'art', s, 1, pg_temp.id(k || 'k')
  from (values ('p','sent'),('pc','cancelled'),('pe','sent'),('pd','draft')) v(k, s);
insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, note, price_snapshot, booking_required)
  select pg_temp.id(k), 1, now() + a, now() + b, 'Back door', 'Bring cash', '{"kind":"exact","min":12,"max":12}', true
  from (values ('p', interval '2 days', interval '2 days 2 hours'), ('pc', interval '2 days', interval '2 days 2 hours'),
               ('pe', interval '-3 hours', interval '-1 hour'), ('pd', interval '2 days', interval '2 days 2 hours')) v(k, a, b);
insert into rsvps (plan_id, user_id, status, revision)
  select pg_temp.id(k), pg_temp.id('maya'), 'going', 1 from unnest(array['p','pc','pe','pd']) k;

select has_function('public', 'add_invitees', array['uuid','uuid[]'], 'add_invitees exists');
select has_function('public', 'remove_invitee', array['uuid','uuid'], 'remove_invitee exists');
select has_function('public', 'create_plan_link', array['uuid'], 'create_plan_link exists');
select has_function('public', 'revoke_plan_link', array['uuid'], 'revoke_plan_link exists');
select has_function('public', 'preview_plan_link', array['text'], 'preview_plan_link exists');
select has_function('public', 'join_plan', array['text'], 'join_plan exists');
select ok(not has_table_privilege('authenticated', 'private.plan_links', 'SELECT'), 'Clients cannot read link tokens');
select ok(not has_function_privilege('anon', 'public.join_plan(text)', 'EXECUTE'), 'Signed-out clients cannot join');

-- Adding and removing invitees
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$select * from add_invitees(pg_temp.id('p'), array[pg_temp.id('b')])$$, '42501', 'not_organizer', 'Only the organizer adds invitees');
select throws_ok($$select create_plan_link(pg_temp.id('p'))$$, '42501', 'not_organizer', 'Only the organizer makes a link');
select pg_temp.as_user('maya');
select is((select awaiting from add_invitees(pg_temp.id('p'), array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('a')])), 2, 'Two group members added, duplicates ignored');
select is((select awaiting from add_invitees(pg_temp.id('p'), array[pg_temp.id('a')])), 2, 'Adding someone already invited changes nothing');
select throws_ok($$select * from add_invitees(pg_temp.id('p'), array[pg_temp.id('o')])$$, 'P0001', 'recipient_not_a_member', 'Outsiders cannot be added from the group');
select throws_ok($$select * from add_invitees(pg_temp.id('p'), array[pg_temp.id('bl')])$$, 'P0001', 'recipient_not_a_member', 'Blocked members cannot be added');
reset role;
select is(pg_temp.counts('p'), '1/2/0/0', 'Counts 1/2/0/0 after adding a and b');

set local role authenticated;
select pg_temp.as_user('maya');
select throws_ok($$select * from remove_invitee(pg_temp.id('p'), pg_temp.id('maya'))$$, 'P0001', 'cannot_remove_organizer', 'The organizer cannot be removed');
select throws_ok($$select * from remove_invitee(pg_temp.id('p'), pg_temp.id('late'))$$, 'P0001', 'not_invited', 'Removing someone never invited fails');
select is((select awaiting from remove_invitee(pg_temp.id('p'), pg_temp.id('b'))), 1, 'Removing b drops them from the counts');
select lives_ok($$select * from remove_invitee(pg_temp.id('p'), pg_temp.id('b'))$$, 'Removing twice is harmless');
select pg_temp.as_user('b');
select is((select count(*) from plans where id = pg_temp.id('p')), 0::bigint, 'A removed invitee can no longer read the plan');
select pg_temp.as_user('maya');
select is((select awaiting from add_invitees(pg_temp.id('p'), array[pg_temp.id('b')])), 2, 'The organizer can add a removed invitee back');
select pg_temp.as_user('b');
select is((select count(*) from plans where id = pg_temp.id('p')), 1::bigint, 'The person added back can read the plan again');

-- Plans that are cancelled, ended or still drafts
select pg_temp.as_user('maya');
select throws_ok($$select * from add_invitees(pg_temp.id('pc'), array[pg_temp.id('a')])$$, 'P0001', 'plan_cancelled', 'No invitees on a cancelled plan');
select throws_ok($$select create_plan_link(pg_temp.id('pc'))$$, 'P0001', 'plan_cancelled', 'No link for a cancelled plan');
select throws_ok($$select * from add_invitees(pg_temp.id('pe'), array[pg_temp.id('a')])$$, 'P0001', 'plan_ended', 'No invitees on a plan that has ended');
select throws_ok($$select create_plan_link(pg_temp.id('pe'))$$, 'P0001', 'plan_ended', 'No link for a plan that has ended');
select throws_ok($$select create_plan_link(pg_temp.id('pd'))$$, '42501', 'not_organizer', 'A draft has no link');

-- Links
select is(length(set_config('t.tok', create_plan_link(pg_temp.id('p')), true)), 64, 'The link token is 64 characters');
select is(create_plan_link(pg_temp.id('p')), pg_temp.tok(), 'Asking again returns the same link');

select pg_temp.as_user('o');
select is(preview_plan_link(pg_temp.tok()) ->> 'activity', 'Clay and conversation', 'Preview names the activity');
select is(preview_plan_link(pg_temp.tok()) ->> 'inviter', 'Maya', 'Preview names the inviter');
select is(preview_plan_link(pg_temp.tok()) ->> 'group', 'Saturday crew', 'Preview names the group');
select is((preview_plan_link(pg_temp.tok()) -> 'price' ->> 'min')::int, 12, 'Preview shows the price');
select is((preview_plan_link(pg_temp.tok()) ->> 'booking_required')::boolean, true, 'Preview shows the booking notice');
select is((preview_plan_link(pg_temp.tok()) ->> 'already_joined')::boolean, false, 'Preview says the viewer has not joined');
select ok(not (preview_plan_link(pg_temp.tok()) ?| array['note','meeting_point','attendees','rsvps','members']),
  'Preview never carries notes, the meeting point or attendees');
select throws_ok($$select preview_plan_link('nonsense')$$, 'P0001', 'link_unavailable', 'A made-up token shows nothing');
select is((select count(*) from plans), 0::bigint, 'Previewing does not give access to the plan');

select is(join_plan(pg_temp.tok()), pg_temp.id('p'), 'Joining by link returns the plan id');
select is(join_plan(pg_temp.tok()), pg_temp.id('p'), 'Joining twice does nothing');
select is((select count(*) from plans where id = pg_temp.id('p')), 1::bigint, 'The joiner can read the plan');
select is((preview_plan_link(pg_temp.tok()) ->> 'already_joined')::boolean, true, 'Preview now says joined');
reset role;
select is(pg_temp.counts('p'), '1/3/0/0', 'The joiner counts as one Awaiting reply');
select is((select count(*) from rsvps where plan_id = pg_temp.id('p') and user_id = pg_temp.id('o')), 1::bigint, 'One row for the joiner');
select is((select count(*) from group_members where user_id = pg_temp.id('o')), 0::bigint,
  'Joining by link never makes someone a group member');
select is((select count(*) from group_members where group_id = pg_temp.id('g')), 4::bigint, 'The group roster is unchanged');

set local role authenticated;
select pg_temp.as_user('o');
select lives_ok($$select * from respond(pg_temp.id('p'), 1, 'going')$$, 'A person who joined by link can answer');
select pg_temp.as_user('nameless');
select throws_ok($$select join_plan(pg_temp.tok())$$, 'P0001', 'profile_required', 'Joining needs a finished profile');
select pg_temp.as_user('bl');
select throws_ok($$select join_plan(pg_temp.tok())$$, 'P0001', 'link_unavailable', 'A blocked group member cannot use the link');

-- Removed people stay out
select pg_temp.as_user('maya');
select is((select going + awaiting from remove_invitee(pg_temp.id('p'), pg_temp.id('o'))), 3, 'Removing the link joiner drops them from the counts');
select pg_temp.as_user('o');
select throws_ok($$select join_plan(pg_temp.tok())$$, 'P0001', 'removed_from_plan', 'A removed person cannot rejoin by link');

-- Revoking
select pg_temp.as_user('a');
select throws_ok($$select revoke_plan_link(pg_temp.id('p'))$$, '42501', 'not_organizer', 'Only the organizer revokes');
select pg_temp.as_user('maya');
select lives_ok($$select revoke_plan_link(pg_temp.id('p'))$$, 'The organizer revokes the link');
select lives_ok($$select revoke_plan_link(pg_temp.id('p'))$$, 'Revoking twice is harmless');
select pg_temp.as_user('late');
select throws_ok($$select join_plan(pg_temp.tok())$$, 'P0001', 'link_unavailable', 'A revoked link admits no one new');
select throws_ok($$select preview_plan_link(pg_temp.tok())$$, 'P0001', 'link_unavailable', 'A revoked link shows no preview');
select pg_temp.as_user('a');
select is((select count(*) from plans where id = pg_temp.id('p')), 1::bigint, 'Revoking keeps people already in');
select pg_temp.as_user('maya');
select isnt(set_config('t.new', create_plan_link(pg_temp.id('p')), true), pg_temp.tok(), 'A new link after revoking is a different token');
select pg_temp.as_user('late');
select is(join_plan(current_setting('t.new')), pg_temp.id('p'), 'The new link works');
reset role;
select is((select count(*) from private.plan_links where plan_id = pg_temp.id('p') and revoked_at is null), 1::bigint, 'One live link per plan');

-- Expiry at the plan's end, and cancellation
insert into private.plan_links (token, plan_id) values (repeat('e', 64), pg_temp.id('pe')), (repeat('c', 64), pg_temp.id('pc'));
set local role authenticated;
select pg_temp.as_user('late');
select throws_ok($$select join_plan(repeat('e', 64))$$, 'P0001', 'link_unavailable', 'A link stops working when the plan ends');
select throws_ok($$select join_plan(repeat('c', 64))$$, 'P0001', 'link_unavailable', 'A link to a cancelled plan stops working');

select * from finish();
rollback;
