begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text, anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', anon)::text, true) $$;

-- Fixture (as superuser): one listing + one sent plan per case. maya organizes (Going); a is Going, b is Awaiting,
-- c Can't go. Every case starts at price 20 (exact) with no booking unless the arguments say otherwise.
insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c']) n;
update profiles set display_name = id::text;
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id) select pg_temp.id('g'), pg_temp.id(n) from unnest(array['maya','a','b','c']) n;

create function pg_temp.mk(n text, kind text default 'exact', pmin numeric default 20, pmax numeric default 20,
  booking boolean default false, st text default 'sent', starts interval default '2 days') returns void
language plpgsql as $$
begin
  insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, booking_required, source)
    values (pg_temp.id('e_' || n), n, 'art', kind, pmin, pmax, 'flexible', booking, 'PLACEHOLDER: test');
  insert into plans (id, group_id, organizer_id, experience_id, experience_name, experience_category, state,
                     current_revision, client_key, updated_at)
    values (pg_temp.id('p_' || n), pg_temp.id('g'), pg_temp.id('maya'), pg_temp.id('e_' || n), n, 'art', st, 1,
            pg_temp.id('c_' || n), now() - interval '1 hour');
  insert into plan_revisions (plan_id, revision, start_at, end_at, meeting_point, price_snapshot, booking_required)
    values (pg_temp.id('p_' || n), 1, now() + starts, now() + starts + interval '2 hours', 'Door',
            jsonb_build_object('kind', kind, 'min', pmin, 'max', pmax), booking);
  insert into rsvps (plan_id, user_id, status, revision)
    select pg_temp.id('p_' || n), pg_temp.id(u), s, 1
    from (values ('maya', 'going'), ('a', 'going'), ('b', 'awaiting'), ('c', 'cant_go')) v(u, s);
end $$;
create function pg_temp.counts(n text) returns text language sql as $$
  select string_agg(status || ':' || c, ' ' order by status) from
    (select status, count(*) c from rsvps where plan_id = pg_temp.id('p_' || n) group by status) s $$;

select pg_temp.mk('up');                                          -- price goes higher
select pg_temp.mk('down', 'exact', 30, 30);                       -- price goes lower
select pg_temp.mk('unknown', 'unknown', null, null);              -- unknown -> known
select pg_temp.mk('known', 'exact', 20, 20);                      -- known -> unknown
select pg_temp.mk('book');                                        -- booking becomes required
select pg_temp.mk('unbook', 'exact', 20, 20, true);               -- booking requirement removed
select pg_temp.mk('both');                                        -- booking required AND price higher
select pg_temp.mk('same');                                        -- no listing change
select pg_temp.mk('started', starts => interval '-1 hour');       -- already started
select pg_temp.mk('cancelled', st => 'cancelled');
select pg_temp.mk('draft', st => 'draft');
select pg_temp.mk('removed');                                     -- listing removed from the catalog

-- The catalog changes
update experiences set price_min = 30, price_max = 30 where id = pg_temp.id('e_up');
update experiences set price_min = 20, price_max = 20 where id = pg_temp.id('e_down');
update experiences set price_kind = 'exact', price_min = 15, price_max = 15 where id = pg_temp.id('e_unknown');
update experiences set price_kind = 'unknown', price_min = null, price_max = null where id = pg_temp.id('e_known');
update experiences set booking_required = true where id in (pg_temp.id('e_book'), pg_temp.id('e_started'),
  pg_temp.id('e_cancelled'), pg_temp.id('e_draft'), pg_temp.id('e_removed'));
update experiences set booking_required = false where id = pg_temp.id('e_unbook');
update experiences set booking_required = true, price_min = 30, price_max = 30 where id = pg_temp.id('e_both');
update experiences set price_min = 99, price_max = 99 where id in (pg_temp.id('e_started'), pg_temp.id('e_cancelled'),
  pg_temp.id('e_draft'), pg_temp.id('e_removed'));
update experiences set status = 'removed' where id = pg_temp.id('e_removed');

-- Contract
select has_function('public', 'apply_listing_changes', array[]::text[], 'apply_listing_changes() exists');
select ok(not has_function_privilege('anon', 'public.apply_listing_changes()', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('authenticated', 'public.apply_listing_changes()', 'execute'), 'Clients cannot run the job');
select ok(not has_function_privilege('authenticated', 'private.apply_listing_change(uuid)', 'execute'), 'Clients cannot reach the helper');

select is(public.apply_listing_changes(), 7, 'Seven upcoming sent plans changed; started, cancelled, draft, removed and unchanged were skipped');
select is(public.apply_listing_changes(), 0, 'A second run changes nothing');
select lives_ok($$set constraints all immediate$$, 'No deferred foreign key is left broken');

-- Minor price changes: same revision, previous price kept, Updated label, answers untouched
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p_up') and revision = 1),
  '{"kind":"exact","min":30,"max":30,"previous":{"kind":"exact","min":20,"max":20}}'::jsonb, 'Higher price is stored with the old one');
select is((select current_revision from plans where id = pg_temp.id('p_up')), 1, 'Higher price is not a new revision');
select is(pg_temp.counts('up'), 'awaiting:1 cant_go:1 going:2', 'Higher price changes nobody''s answer');
select ok((select updated_at > now() - interval '1 minute' from plans where id = pg_temp.id('p_up')), 'Higher price sets updated_at');
select is((select price_snapshot -> 'previous' ->> 'min' from plan_revisions where plan_id = pg_temp.id('p_down')), '30', 'Lower price keeps the old one');
select is((select current_revision from plans where id = pg_temp.id('p_down')), 1, 'Lower price is not a new revision');
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p_unknown') and revision = 1),
  '{"kind":"exact","min":15,"max":15,"previous":{"kind":"unknown","min":null,"max":null}}'::jsonb, 'Unknown to known is minor and remembers "unknown"');
select is((select current_revision from plans where id = pg_temp.id('p_unknown')), 1, 'Unknown to known is not a new revision');
select is(pg_temp.counts('unknown'), 'awaiting:1 cant_go:1 going:2', 'Unknown to known changes nobody''s answer');
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p_known') and revision = 1),
  '{"kind":"unknown","min":null,"max":null,"previous":{"kind":"exact","min":20,"max":20}}'::jsonb, 'Known to unknown is minor too');
select is((select current_revision from plans where id = pg_temp.id('p_known')), 1, 'Known to unknown is not a new revision');

-- Booking removed: minor
select is((select booking_required from plan_revisions where plan_id = pg_temp.id('p_unbook') and revision = 1), false, 'Booking requirement removed on the same revision');
select is((select current_revision from plans where id = pg_temp.id('p_unbook')), 1, 'Removing booking is not a new revision');
select is(pg_temp.counts('unbook'), 'awaiting:1 cant_go:1 going:2', 'Removing booking changes nobody''s answer');
select ok((select updated_at > now() - interval '1 minute' from plans where id = pg_temp.id('p_unbook')), 'Removing booking sets updated_at');
select is((select price_snapshot ->> 'previous' from plan_revisions where plan_id = pg_temp.id('p_unbook') and revision = 1), null, 'No price notice when only booking changed');

-- Newly required booking: material
select is((select current_revision from plans where id = pg_temp.id('p_book')), 2, 'Newly required booking makes revision 2');
select is((select booking_required from plan_revisions where plan_id = pg_temp.id('p_book') and revision = 2), true, 'Revision 2 requires booking');
select is((select booking_required from plan_revisions where plan_id = pg_temp.id('p_book') and revision = 1), false, 'Revision 1 is kept as it was');
select is(pg_temp.counts('book'), 'awaiting:1 cant_go:1 going:1 needs_reconfirm:1', 'Going invitee reconfirms; Awaiting and Can''t go stay; organizer stays Going');
select is((select revision from rsvps where plan_id = pg_temp.id('p_book') and user_id = pg_temp.id('maya')), 2, 'Organizer is Going on the new revision');
select is((select status from rsvps where plan_id = pg_temp.id('p_book') and user_id = pg_temp.id('a')), 'needs_reconfirm', 'The Going invitee must reconfirm');
select is((select (start_at, end_at, meeting_point) from plan_revisions where plan_id = pg_temp.id('p_book') and revision = 2),
  (select (start_at, end_at, meeting_point) from plan_revisions where plan_id = pg_temp.id('p_book') and revision = 1), 'Time and place carry over');
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p_book') and revision = 2),
  '{"kind":"exact","min":20,"max":20}'::jsonb, 'Price carries over untouched');
select ok((select updated_at > now() - interval '1 minute' from plans where id = pg_temp.id('p_book')), 'Material change sets updated_at');

-- Both at once: one new revision with the new price and the old one kept
select is((select current_revision from plans where id = pg_temp.id('p_both')), 2, 'Booking plus price is one new revision');
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p_both') and revision = 2),
  '{"kind":"exact","min":30,"max":30,"previous":{"kind":"exact","min":20,"max":20}}'::jsonb, 'The new revision carries the price change');
select is((select price_snapshot from plan_revisions where plan_id = pg_temp.id('p_both') and revision = 1),
  '{"kind":"exact","min":20,"max":20}'::jsonb, 'The old revision keeps the old price');
select is(pg_temp.counts('both'), 'awaiting:1 cant_go:1 going:1 needs_reconfirm:1', 'Going invitee reconfirms once');

-- Untouched
select is((select updated_at < now() - interval '30 minutes' from plans where id = pg_temp.id('p_same')), true, 'A plan whose listing did not change is untouched');
select is((select count(*) from plan_revisions where plan_id = pg_temp.id('p_same')), 1::bigint, 'No revision for an unchanged plan');
select is((select current_revision || '|' || (select booking_required from plan_revisions where plan_id = p.id) from plans p where p.id = pg_temp.id('p_started')),
  '1|false', 'A plan that already started is not changed');
select is((select price_snapshot ->> 'min' from plan_revisions where plan_id = pg_temp.id('p_cancelled')), '20', 'A cancelled plan is not changed');
select is((select price_snapshot ->> 'min' from plan_revisions where plan_id = pg_temp.id('p_draft')), '20', 'A draft is not changed');
select is((select price_snapshot ->> 'min' from plan_revisions where plan_id = pg_temp.id('p_removed')), '20', 'A removed listing does not change its plan');

-- A stale answer sent from a screen opened before the booking change is rejected; reconfirming works
set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$select * from respond(pg_temp.id('p_book'), 1, 'going')$$, 'P0001', 'stale_revision', 'Answer from the old screen is rejected');
select lives_ok($$select * from respond(pg_temp.id('p_book'), 2, 'going')$$, 'Reconfirm on revision 2');
-- The invitee can read the old and new price (RLS)
select is((select price_snapshot -> 'previous' ->> 'min' from plan_revisions where plan_id = pg_temp.id('p_up')), '20', 'Invitee reads the previous price');
reset role;
select is(pg_temp.counts('book'), 'awaiting:1 cant_go:1 going:2', 'Counts after the reconfirm');

-- edit_plan (TEC-33) still treats date and meeting point as material and the note as minor
set local role authenticated;
select pg_temp.as_user('maya');
select is(public.edit_plan(pg_temp.id('p_same'), '{"note":"Bring cash"}') ->> 'material', 'false', 'Note is a minor edit');
select is(public.edit_plan(pg_temp.id('p_same'), '{"meeting_point":"Side gate"}') ->> 'material', 'true', 'Meeting point is a material edit');
select is(public.edit_plan(pg_temp.id('p_same'), jsonb_build_object(
  'start_local', to_char((now() + interval '3 days') at time zone 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI'),
  'end_local', to_char((now() + interval '3 days 2 hours') at time zone 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI'))) ->> 'material',
  'true', 'A new date is a material edit');

select * from finish();
rollback;
