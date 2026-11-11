begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';

insert into auth.users (id) select pg_temp.id(n) from unnest(array['alice','bob','carol','dana']) n;
insert into profiles (id, display_name, budget_cap)
  select pg_temp.id(n), n, 25 from unnest(array['alice','bob','carol','dana']) n
  on conflict (id) do update set display_name = excluded.display_name, budget_cap = excluded.budget_cap;
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('a'), 'Group A', pg_temp.id('alice'), pg_temp.id('a')),
  (pg_temp.id('b'), 'Group B', pg_temp.id('bob'), pg_temp.id('b'));
insert into group_members (group_id, user_id, role) values
  (pg_temp.id('a'), pg_temp.id('alice'), 'owner'), (pg_temp.id('a'), pg_temp.id('carol'), 'member'),
  (pg_temp.id('b'), pg_temp.id('bob'), 'owner');
insert into join_codes values ('ABCDEF', pg_temp.id('a'), now() + interval '14 days', null),
  ('GHJKLM', pg_temp.id('b'), now() + interval '14 days', null);
insert into experiences (id, name, category, price_kind, timing_kind, source)
  values (pg_temp.id('venue'), 'Test venue', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: RLS test');
insert into picks (id, group_id, organizer_id, client_key, deadline) values
  (pg_temp.id('pick-a'), pg_temp.id('a'), pg_temp.id('alice'), pg_temp.id('pick-a'), now() + interval '1 day'),
  (pg_temp.id('pick-b'), pg_temp.id('b'), pg_temp.id('bob'), pg_temp.id('pick-b'), now() + interval '1 day');
insert into pick_options (id, pick_id, experience_id, position) values
  (pg_temp.id('option-a'), pg_temp.id('pick-a'), pg_temp.id('venue'), 1),
  (pg_temp.id('option-b'), pg_temp.id('pick-b'), pg_temp.id('venue'), 1);
insert into votes values (pg_temp.id('option-a'), pg_temp.id('alice'), 'yes'),
  (pg_temp.id('option-a'), pg_temp.id('carol'), 'no'), (pg_temp.id('option-b'), pg_temp.id('bob'), 'maybe');
insert into option_tallies (option_id, yes, no) values (pg_temp.id('option-a'), 1, 1), (pg_temp.id('option-b'), 0, 0);
insert into pick_voter_status values (pg_temp.id('pick-a'), pg_temp.id('alice'), true),
  (pg_temp.id('pick-a'), pg_temp.id('carol'), true), (pg_temp.id('pick-b'), pg_temp.id('bob'), true);
insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state, current_revision, client_key)
  values (pg_temp.id('plan-a'), pg_temp.id('a'), pg_temp.id('alice'), pg_temp.id('venue'), 'Test venue', 'Outdoors', 'sent', 1, pg_temp.id('plan-a'));
insert into plan_revisions values (pg_temp.id('plan-a'), 1, now() + interval '1 day', now() + interval '2 days',
  'America/Chicago', 'Entrance', 'Private note', '{"kind":"free"}', false);
insert into rsvps values (pg_temp.id('plan-a'), pg_temp.id('alice'), 'going', 1, null),
  (pg_temp.id('plan-a'), pg_temp.id('dana'), 'awaiting', 1, null);
-- A profile can exist before the person has chosen a name (created at first sign-in).
insert into auth.users (id) select pg_temp.id(n) from unnest(array['erin','frank']) n;
insert into profiles (id) values (pg_temp.id('erin')) on conflict (id) do nothing;
set constraints all immediate;
select ok((select display_name is null from profiles where id = pg_temp.id('erin')), 'Profile can exist without a name');
select throws_ok($$insert into profiles (id, display_name) values (pg_temp.id('frank'), '   ')$$, '23514', null, 'A blank name is still rejected');

select ok(bool_and(c.relrowsecurity), 'RLS on every core table') from pg_class c
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r';
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and cmd <> 'SELECT'), 'SELECT-only policies');
select ok(not exists (select 1 from information_schema.tables t
  cross join unnest(array['anon','authenticated']) r cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
  where t.table_schema = 'public' and has_table_privilege(r, 'public.' || t.table_name, p)), 'No client mutation grants');
select ok(not has_table_privilege('authenticated', 'public.join_attempts', 'SELECT'), 'Rate limits stay private');
select set_eq($$select tablename::text from pg_publication_tables where pubname = 'supabase_realtime'$$,
  $$values ('group_members'), ('picks'), ('pick_options'), ('option_tallies'), ('pick_voter_status'), ('plans'), ('plan_revisions'), ('rsvps')$$,
  'Exact Realtime table set; raw votes excluded');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id('carol')::text, true);
select is((select count(*) from groups), 1::bigint, 'Member A sees A only');
select is((select count(*) from group_members), 2::bigint, 'Member A sees A roster only');
select is((select count(*) from join_codes), 1::bigint, 'Member A sees A codes only');
select is((select count(*) from picks), 1::bigint, 'Member A sees A picks only');
select is((select count(*) from pick_options), 1::bigint, 'Member A sees A options only');
select is((select count(*) from votes), 1::bigint, 'Member reads only own vote');
select is((select value from votes), 'no', 'Own vote is the correct row');
select is((select yes + no from option_tallies), 2, 'Shared tally includes both private votes');
select is((select count(*) from pick_voter_status), 2::bigint, 'Shared completion status visible');
select is((select count(*) from plans), 0::bigint, 'Group member without invitation cannot read plan');
select is((select count(*) from plan_revisions), 0::bigint, 'Uninvited member cannot read revisions');
select is((select count(*) from rsvps), 0::bigint, 'Uninvited member cannot read RSVPs');
select is((select count(*) from profiles), 1::bigint, 'Other profiles and budgets remain private');
select throws_ok($$insert into votes values (pg_temp.id('option-a'), pg_temp.id('carol'), 'yes')$$, '42501', null, 'Direct writes rejected');

select set_config('request.jwt.claim.sub', pg_temp.id('alice')::text, true);
select is((select count(*) from plans), 1::bigint, 'Organizer sees plan');
select is((select count(*) from votes), 1::bigint, 'Organizer cannot read someone else''s vote');
select set_config('request.jwt.claim.sub', pg_temp.id('dana')::text, true);
select is((select count(*) from groups), 0::bigint, 'Invitee need not belong to group');
select is((select count(*) from plans), 1::bigint, 'Invitee sees plan without membership');
select is((select count(*) from plan_revisions), 1::bigint, 'Invitee sees revisions');
select is((select count(*) from rsvps), 2::bigint, 'Invitee sees RSVP roster');
select is((select count(*) from votes), 0::bigint, 'Invitee cannot read group votes');

reset role;
update rsvps set removed_at = now() where user_id = pg_temp.id('dana');
update group_members set removed_at = now() where user_id = pg_temp.id('alice');
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id('dana')::text, true);
select is((select count(*) from plans), 0::bigint, 'Removed invitee loses plan access');
select is((select count(*) from rsvps), 0::bigint, 'Removed invitee loses RSVP access');
select set_config('request.jwt.claim.sub', pg_temp.id('alice')::text, true);
select is((select count(*) from groups), 0::bigint, 'Removed member loses group access');
select is((select count(*) from option_tallies), 0::bigint, 'Removed member loses tallies');
select is((select count(*) from plans), 1::bigint, 'Leaving group preserves organizer plan access');
reset role;
set local role anon;
select throws_ok('select * from public.groups', '42501', null, 'Signed-out clients cannot read groups');
select throws_ok('select * from public.experiences', '42501', null, 'Signed-out clients cannot browse');
reset role;
select * from finish();
rollback;
