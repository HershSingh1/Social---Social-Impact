-- TEC-89 (P0-11): listed session times (G6) and the unconfirmed price/booking acknowledgement (G15).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u), 'is_anonymous', false)::text, true) $$;
create function pg_temp.local_in(i interval) returns text language sql as $$
  select to_char((now() + i) at time zone 'America/Chicago', 'YYYY-MM-DD"T"HH24:MI') $$;
-- send_plan as maya with key k for experience ex; ack null means the argument is left out.
create function pg_temp.send(k text, ex text, ack boolean default null) returns uuid language plpgsql as $$
begin
  perform pg_temp.as_user('maya');
  set local role authenticated;
  if ack is null then
    return public.send_plan(client_key => pg_temp.id(k), group_id => pg_temp.id('g'), experience_id => pg_temp.id(ex),
      start_local => pg_temp.local_in('3 days'), end_local => pg_temp.local_in('3 days 2 hours'),
      meeting_point => 'Door', recipients => array[pg_temp.id('a')]);
  end if;
  return public.send_plan(client_key => pg_temp.id(k), group_id => pg_temp.id('g'), experience_id => pg_temp.id(ex),
    start_local => pg_temp.local_in('3 days'), end_local => pg_temp.local_in('3 days 2 hours'),
    meeting_point => 'Door', recipients => array[pg_temp.id('a')], acknowledged => ack);
end $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a']) n;
update profiles set display_name = id::text;
insert into groups (id, name, owner_id, client_key) values (pg_temp.id('g'), 'G', pg_temp.id('maya'), pg_temp.id('gk'));
insert into group_members (group_id, user_id, role) values
  (pg_temp.id('g'), pg_temp.id('maya'), 'owner'), (pg_temp.id('g'), pg_temp.id('a'), 'member');
insert into experiences (id, name, category, price_kind, price_min, price_max, timing_kind, booking_required, source) values
  (pg_temp.id('known'), 'Known', 'art', 'exact', 25, 25, 'flexible', false, 'PLACEHOLDER: test'),
  (pg_temp.id('price?'), 'Price unknown', 'art', 'unknown', null, null, 'flexible', false, 'PLACEHOLDER: test'),
  (pg_temp.id('book?'), 'Booking unknown', 'art', 'exact', 25, 25, 'flexible', null, 'PLACEHOLDER: test'),
  (pg_temp.id('book?2'), 'Booking unknown 2', 'art', 'exact', 25, 25, 'flexible', null, 'PLACEHOLDER: test');

-- Sessions (G6): [{start_local, end_local}], stored for display
select lives_ok($$insert into experiences (id, name, category, price_kind, timing_kind, sessions, source) values
  (pg_temp.id('fixed'), 'Class', 'art', 'free', 'fixed',
   '[{"start_local":"2037-07-01T10:00","end_local":"2037-07-01T12:00"},{"start_local":"2037-07-02 14:30:00","end_local":"2037-07-02 16:00:00"}]',
   'PLACEHOLDER: test')$$, 'Listed sessions are stored');
select is((select sessions -> 1 ->> 'start_local' from experiences where id = pg_temp.id('fixed')), '2037-07-02 14:30:00', 'Sessions read back as stored');
select throws_ok($$update experiences set sessions = '{"start_local":"2037-07-01T10:00","end_local":"2037-07-01T12:00"}' where id = pg_temp.id('fixed')$$,
  '23514', null, 'Sessions must be a list');
select throws_ok($$update experiences set sessions = '[]' where id = pg_temp.id('fixed')$$, '23514', null, 'An empty list is refused (use null)');
select throws_ok($$update experiences set sessions = '[{"start_local":"2037-07-01T10:00"}]' where id = pg_temp.id('fixed')$$,
  '23514', null, 'A session needs an end');
select throws_ok($$update experiences set sessions = '[{"start_local":"2037-07-01T10:00","end_local":"2037-07-01T09:00"}]' where id = pg_temp.id('fixed')$$,
  '23514', null, 'A session cannot end before it starts');
select throws_ok($$update experiences set sessions = '[{"start_local":"2037-07-01T10:00Z","end_local":"2037-07-01T12:00Z"}]' where id = pg_temp.id('fixed')$$,
  '23514', null, 'Session times are local, no offset');
select lives_ok($$update experiences set sessions = null where id = pg_temp.id('known')$$, 'No sessions is fine');
-- Listed sessions are shown, not enforced: a time outside every session is accepted
select lives_ok($$select pg_temp.send('fx', 'fixed')$$, 'Fixed-time activity planned outside its listed sessions');
reset role;

-- Booking can be unknown (NULL)
select is((select booking_required from experiences where id = pg_temp.id('book?')), null::boolean, 'Booking unknown is stored as null');

-- Known price and booking: no acknowledgement needed, existing callers (no acknowledged argument) still work
select lives_ok($$select pg_temp.send('k1', 'known')$$, 'Known facts send without acknowledged');
set local role authenticated;
select lives_ok($$select public.send_plan(pg_temp.id('k1p'), pg_temp.id('g'), pg_temp.id('known'), pg_temp.local_in('3 days'),
  pg_temp.local_in('3 days 2 hours'), 'Door', null, '{}', null, 'America/Chicago')$$, 'Old 10-argument call still works');
reset role;

-- Unknown price
select throws_ok($$select pg_temp.send('u1', 'price?')$$, 'P0001', 'unconfirmed_info_not_acknowledged', 'Unknown price needs the box ticked');
reset role;
select throws_ok($$select pg_temp.send('u1', 'price?', false)$$, 'P0001', 'unconfirmed_info_not_acknowledged', 'acknowledged false is refused');
reset role;
select is((select count(*) from plans where client_key = pg_temp.id('u1')), 0::bigint, 'Refused send leaves no plan');
select is((select count(*) from private.send_plan_requests where client_key = pg_temp.id('u1')), 0::bigint, 'Refused send leaves no request row');
select lives_ok($$select pg_temp.send('u1', 'price?', true)$$, 'Same key sends once acknowledged');
reset role;
select is((select price_snapshot ->> 'kind' from plan_revisions v join plans p on p.id = v.plan_id where p.client_key = pg_temp.id('u1')),
  'unknown', 'Plan shows the price as unknown');

-- Unknown booking
select throws_ok($$select pg_temp.send('u2', 'book?')$$, 'P0001', 'unconfirmed_info_not_acknowledged', 'Unknown booking needs the box ticked');
reset role;
select lives_ok($$select pg_temp.send('u2', 'book?', true)$$, 'Unknown booking sends once acknowledged');
reset role;
select is((select booking_required from plan_revisions v join plans p on p.id = v.plan_id where p.client_key = pg_temp.id('u2')),
  null::boolean, 'Plan keeps booking as unknown');

-- Retries stay idempotent on client_key; acknowledged is not part of the payload
select is(pg_temp.send('u2', 'book?', true), (select id from plans where client_key = pg_temp.id('u2')), 'Retry returns the same plan');
reset role;
select is(pg_temp.send('u2', 'book?'), (select id from plans where client_key = pg_temp.id('u2')), 'Retry without the flag still returns the sent plan');
reset role;
select is((select count(*) from plans where experience_id = pg_temp.id('book?')), 1::bigint, 'Retries made no second plan');
select is((select count(*) from rsvps r join plans p on p.id = r.plan_id where p.client_key = pg_temp.id('u2')), 2::bigint, 'Retries made no second invitation');

-- Listing changes (C6) with unknown booking
set local role authenticated;
select pg_temp.as_user('a');
select lives_ok($$select * from respond((select id from plans where client_key = pg_temp.id('u2')), 1, 'going')$$, 'Invitee answers Going');
reset role;
select lives_ok($$select pg_temp.send('u3', 'book?2', true)$$, 'Second unknown-booking plan');
reset role;
update experiences set booking_required = true where id = pg_temp.id('book?');
update experiences set booking_required = false where id = pg_temp.id('book?2');
select is(public.apply_listing_changes(), 2, 'Both plans pick up the booking change');
select is((select current_revision from plans where client_key = pg_temp.id('u2')), 2, 'Unknown to required is material: new revision');
select is((select status from rsvps r join plans p on p.id = r.plan_id where p.client_key = pg_temp.id('u2') and r.user_id = pg_temp.id('a')),
  'needs_reconfirm', 'Going invitee reconfirms');
select is((select current_revision || '/' || (select booking_required from plan_revisions v where v.plan_id = p.id and v.revision = 1)
  from plans p where p.client_key = pg_temp.id('u3')), '1/false', 'Unknown to not needed is minor: same revision');
update experiences set booking_required = null where id = pg_temp.id('book?2');
select is(public.apply_listing_changes(), 1, 'Not needed to unknown reaches the plan');
select is((select current_revision || '/' || coalesce((select booking_required::text from plan_revisions v where v.plan_id = p.id and v.revision = 1), 'unknown')
  from plans p where p.client_key = pg_temp.id('u3')), '1/unknown', 'Not needed to unknown is minor');
select is(public.apply_listing_changes(), 0, 'Running again changes nothing');

select * from finish();
rollback;
