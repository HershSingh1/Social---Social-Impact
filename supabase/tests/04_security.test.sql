begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---- test helpers (pg_temp: vanish with the session). Call them as the superuser: `reset role;` first.
create function pg_temp.uid(p text) returns uuid language sql immutable as $$ select md5('sq-test-' || p)::uuid $$;
do $$ begin execute format('grant usage on schema %s to public', pg_my_temp_schema()::regnamespace); end $$;
create function pg_temp.mk(p text, p_anon boolean default false) returns void language plpgsql as $$
begin
  insert into auth.users (id, aud, role, email, is_anonymous)
  values (pg_temp.uid(p), 'authenticated', 'authenticated',
          case when p_anon then null else lower(p) || '@example.test' end, p_anon);
  insert into public.profiles (id, display_name, is_guest) values (pg_temp.uid(p), initcap(p), p_anon);
end $$;
create function pg_temp.login(p text) returns void language plpgsql as $$
declare v_anon boolean;
begin
  execute 'reset role';
  select is_anonymous into v_anon from auth.users where id = pg_temp.uid(p);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated',
                     'is_anonymous', v_anon)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.gid(p text default 'Saturday crew') returns uuid language sql stable security definer as
  $$ select id from public.groups where name = p $$;
create function pg_temp.code(p text default 'Saturday crew') returns text language sql stable security definer as
  $$ select code from public.join_codes where group_id = pg_temp.gid(p) and revoked_at is null $$;
create function pg_temp.eid(p text) returns uuid language sql stable security definer as
  $$ select id from public.experiences where name = p $$;
create function pg_temp.world() returns void language plpgsql as $$
begin
  -- tests build their own catalog; this also clears the seed data (rolled back at the end)
  delete from public.experiences;
  perform pg_temp.mk('maya'); perform pg_temp.mk('jordan', true); perform pg_temp.mk('sam', true);
  perform pg_temp.mk('priya'); perform pg_temp.mk('luis'); perform pg_temp.mk('tess');
  insert into public.experiences (name, category, description, lat, lng, area, price_kind, price_min, price_max,
    timing_kind, sessions, hours_text, duration_min, meeting_point, booking_required, booking_url, source, checked_on)
  values
   ('Sketch and stroll', 'art_walks', 'Walk and draw.', 30.27, -97.75, 'Shoal Creek', 'free', 0, 0,
    'flexible', null, 'Trail open daily', 90, 'Benches at the W 3rd St trailhead', false, null, 'PLACEHOLDER: test', '2026-11-02'),
   ('Clay and conversation', 'make', 'Wheel throwing.', 30.26, -97.72, 'East Austin', 'exact', 38, 38,
    'fixed', '["Sat 10:00 AM"]'::jsonb, null, 90, 'Studio front desk', true, 'https://example.com/clay', 'PLACEHOLDER: test', '2026-11-02'),
   ('Barton Springs swim', 'outdoors', 'Cold pool.', 30.264, -97.771, 'Zilker', 'estimated', 5, 9,
    'flexible', null, 'Open most days', 90, 'Main gate', false, null, 'PLACEHOLDER: test', '2026-11-02'),
   ('Mount Bonnell sunset', 'outdoors', 'Stairs.', 30.32, -97.77, 'West Austin', 'free', 0, 0,
    'flexible', null, 'Park open', 45, 'Base of the stairs', false, null, 'PLACEHOLDER: test', '2026-11-02');
end $$;
-- Saturday crew: Maya (owner, account) + Jordan, Sam (guests) + Priya, Luis, Tess (accounts)
create function pg_temp.crew() returns void language plpgsql as $$
declare m text;
begin
  perform pg_temp.world();
  perform pg_temp.login('maya'); perform public.create_group('Saturday crew');
  execute 'reset role';
  foreach m in array array['jordan', 'sam', 'priya', 'luis', 'tess'] loop
    perform pg_temp.login(m); perform public.join_group(pg_temp.code());
    execute 'reset role';
  end loop;
end $$;

-- =====================================================================================================
-- Security: RLS everywhere, no direct writes, locked-down functions, guests vs accounts, realtime
-- =====================================================================================================
create function pg_temp.opts(variadic p text[]) returns jsonb language sql stable as
  $$ select jsonb_agg(jsonb_build_object('experience_id', pg_temp.eid(x)) order by ord) from unnest(p) with ordinality t(x, ord) $$;
create function pg_temp.lt(p_days int, p_hour int) returns timestamp language sql stable as
  $$ select date_trunc('day', now() at time zone 'America/Chicago') + p_days * interval '1 day' + p_hour * interval '1 hour' $$;

select pg_temp.crew();
select pg_temp.mk('outsider');

-- ---- catalog-level guarantees
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0, 'RLS is enabled on every public table');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
                or has_table_privilege('authenticated', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))), 0,
          'signed-in clients (guests included) have no write privilege on any table');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
                or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))), 0,
          'the signed-out role has no table privileges');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')), 0, 'the signed-out role can execute no function');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
          array['add_option', 'cancel_pick', 'cast_vote', 'close_pick', 'create_group', 'create_pick', 'edit_plan', 'join_group',
                'override_pick', 'preview_group_code', 'respond', 'send_plan', 'set_profile'],
          'clients can execute exactly the intended RPCs (close_due_picks is cron-only)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
          'every SECURITY DEFINER function pins its search_path');
select is((select count(*)::int from (values ('group_members'), ('picks'), ('pick_options'), ('option_tallies'),
            ('pick_voter_status'), ('plans'), ('plan_revisions'), ('rsvps')) v(t)
            where not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                                and schemaname = 'public' and tablename = v.t)), 0, 'live tables are in the realtime publication');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'votes'), 0,
          'votes are not broadcast (they are private per user)');

-- ---- direct writes are refused even for the data owner
select pg_temp.login('maya');
select throws_ok($$insert into public.groups (name, owner_id) values ('Hack', auth.uid())$$, '42501', null, 'cannot insert into groups directly');
select throws_ok($$update public.groups set name = 'Hacked'$$, '42501', null, 'cannot update groups directly');
select throws_ok($$delete from public.group_members$$, '42501', null, 'cannot delete members directly');
select throws_ok($$update public.picks set state = 'closed'$$, '42501', null, 'cannot close a pick by updating the table');
select throws_ok($$insert into public.votes (option_id, user_id, value) select id, auth.uid(), 'yes' from public.pick_options limit 1$$, '42501', null, 'cannot vote by inserting');
select throws_ok($$update public.rsvps set status = 'going'$$, '42501', null, 'cannot change an RSVP directly');
select throws_ok($$insert into public.experiences (name) values ('x')$$, '42501', null, 'cannot write the catalog');
select throws_ok($$select * from public.join_attempts$$, '42501', null, 'join_attempts is server only');
reset role;

-- ---- signed-out role
set local role anon;
select throws_ok($$select * from public.experiences$$, '42501', null, 'signed-out cannot read the catalog');
select throws_ok($$select public.create_group('x')$$, '42501', null, 'signed-out cannot call RPCs');
reset role;

-- ---- guests: browse and vote and RSVP, but cannot create groups, picks or plans
select pg_temp.login('jordan');
select ok((select count(*) from public.experiences) >= 4, 'a guest can browse the catalog');
select throws_ok($$select public.create_group('Guest group')$$, 'P0001', 'account_required', 'a guest cannot create a group');
select throws_ok(format($$select public.create_pick(%L, %L, now() + interval '24 hours')$$, pg_temp.gid(),
                 pg_temp.opts('Sketch and stroll', 'Barton Springs swim')), 'P0001', 'account_required', 'a guest cannot create a pick');
select throws_ok(format($$select public.send_plan(%L, %L, %L, %L, %L, 'x')$$, md5('k')::uuid, pg_temp.gid(),
                 pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16)), 'P0001', 'account_required', 'a guest cannot send a plan');
reset role; select pg_temp.login('maya');
select set_config('t.pick', public.create_pick(pg_temp.gid(), pg_temp.opts('Sketch and stroll', 'Barton Springs swim'), now() + interval '24 hours')::text, true);
select set_config('t.plan', public.send_plan(md5('k2')::uuid, pg_temp.gid(), pg_temp.eid('Sketch and stroll'), pg_temp.lt(3, 14), pg_temp.lt(3, 16), 'Trailhead')::text, true);
select pg_temp.login('jordan');
select lives_ok(format($$select public.cast_vote((select id from public.pick_options where pick_id = %L order by position limit 1), 'yes')$$, current_setting('t.pick')),
                'a guest can vote');
select is((select public.respond(current_setting('t.plan')::uuid, 1, 'going') ->> 'going'), '2', 'a guest can RSVP');
reset role;

-- ---- profile visibility follows groups and plans, not the whole user table
select pg_temp.login('jordan');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('maya')), 1, 'a member sees a groupmate''s profile');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('outsider')), 0, 'a member does not see a stranger''s profile');
reset role; select pg_temp.login('outsider');
select is((select count(*)::int from public.profiles), 1, 'a stranger sees only their own profile');
select is((select count(*)::int from public.experiences) >= 4, true, 'but every signed-in user reads the catalog');
reset role;

-- ---- the votes table never reveals other people's votes
select pg_temp.login('maya');
select public.cast_vote((select id from public.pick_options where pick_id = current_setting('t.pick')::uuid order by position limit 1), 'no');
select is((select count(*)::int from public.votes where user_id <> pg_temp.uid('maya')), 0, 'maya cannot read jordan''s vote');
reset role;

select * from finish();
rollback;
