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
-- P0-01 / P0-02 / P0-03: guests, accounts, groups, join codes
-- =====================================================================================================
select pg_temp.world();

-- ---- code alphabet
select is((select count(*)::int from generate_series(1, 500) g
            where private.generate_code() !~ '^[A-HJ-NP-Z2-9]{6}$'), 0,
          'generated codes are 6 chars from A-Z, 2-9 without 0 O 1 I');
select throws_ok($$insert into public.join_codes (code, group_id, expires_at)
                   values ('ABCDE0', gen_random_uuid(), now())$$, '23514', null,
                 'a code containing 0 is rejected by the table check');
select throws_ok($$insert into public.join_codes (code, group_id, expires_at)
                   values ('ABCDEI', gen_random_uuid(), now())$$, '23514', null,
                 'a code containing I is rejected by the table check');

-- ---- guests cannot create groups; accounts can
reset role; select pg_temp.login('jordan');
select throws_ok($$select public.create_group('Nope')$$, 'P0001', 'account_required',
                 'guest cannot create a group');
reset role; select pg_temp.login('maya');
select throws_ok($$select public.create_group('   ')$$, 'P0001', 'invalid_name', 'blank group name rejected');
select throws_ok($$select public.create_group(repeat('x', 51))$$, 'P0001', 'invalid_name', '51-char name rejected');
select lives_ok($$select public.create_group('  Saturday crew  ')$$, 'account creates a group (name trimmed)');
reset role;
select is((select name from public.groups where owner_id = pg_temp.uid('maya')), 'Saturday crew', 'name stored trimmed');
select is((select role from public.group_members where group_id = pg_temp.gid() and user_id = pg_temp.uid('maya')),
          'owner', 'creator is the owner and the only member');
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid()), 1, 'group starts with one member');
select ok(pg_temp.code() ~ '^[A-HJ-NP-Z2-9]{6}$', 'group starts with one active join code');
select ok((select expires_at from public.join_codes where group_id = pg_temp.gid())
          between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', 'code valid 14 days');

-- ---- join: guest, case-insensitive, idempotent
reset role; select pg_temp.login('jordan');
select is((select public.join_group(lower(pg_temp.code())) ->> 'status'), 'joined',
          'guest joins with a lowercase code (case-insensitive)');
select is((select public.join_group(pg_temp.code()) ->> 'status'), 'already_member', 'second join is a no-op');
reset role;
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('jordan')), 1,
          'already-member join did not add a second row');
select is((select is_guest from public.profiles where id = pg_temp.uid('jordan')), true, 'guest profile marked is_guest');

-- ---- wrong codes
reset role; select pg_temp.login('priya');
select is((select public.join_group('ZZZZZZ') ->> 'error'), 'wrong_code', 'unknown code -> wrong_code');
select is((select public.join_group('AB0DEF') ->> 'error'), 'wrong_code', 'code with 0 -> wrong_code');
select is((select public.join_group('ABC') ->> 'error'), 'wrong_code', 'short code -> wrong_code');
select is((select public.join_group(null) ->> 'error'), 'wrong_code', 'null code -> wrong_code');
reset role;
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('priya')), 0, 'no membership after wrong codes');
select is((select count(*)::int from public.join_attempts where user_id = pg_temp.uid('priya')), 4,
          'failed tries are recorded (not rolled back)');
delete from public.join_attempts;

-- ---- expired and revoked look the same
update public.join_codes set expires_at = now() - interval '1 minute' where group_id = pg_temp.gid();
reset role; select pg_temp.login('priya');
select is((select public.join_group(pg_temp.code()) ->> 'error'), 'expired', 'expired code -> expired');
reset role;
select set_config('t.old_code', pg_temp.code(), true);
update public.join_codes set expires_at = now() + interval '14 days', revoked_at = now() where group_id = pg_temp.gid();
select pg_temp.login('priya');
select is((select public.join_group(current_setting('t.old_code')) ->> 'error'), 'expired', 'revoked code -> expired');
reset role;
select is((select count(*)::int from public.join_attempts where user_id = pg_temp.uid('priya')), 0,
          'expired/revoked codes do not count as failed tries');
update public.join_codes set revoked_at = null where group_id = pg_temp.gid();
delete from public.join_attempts;

-- ---- rate limit: 5 wrong tries per minute per user
reset role; select pg_temp.login('sam');
select is((select public.join_group('ZZZZZ' || n) ->> 'error'), 'wrong_code', 'wrong try ' || n)
  from generate_series(2, 6) n;
select is((select public.join_group(pg_temp.code()) ->> 'error'), 'too_many_tries',
          'after 5 wrong tries even the right code is refused');
select is((select public.preview_group_code(pg_temp.code()) ->> 'error'), 'too_many_tries', 'preview shares the limit');
reset role;
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('sam')), 0, 'sam did not join while limited');
select is((select count(*)::int from public.join_attempts where user_id = pg_temp.uid('sam')), 5, 'blocked calls add no attempts');
update public.join_attempts set attempted_at = now() - interval '2 minutes';
select pg_temp.login('sam');
select is((select public.join_group(pg_temp.code()) ->> 'status'), 'joined', 'after a minute the limit lifts');
reset role;
delete from public.join_attempts;

-- ---- per-IP limit (20 / minute) across different users
select pg_temp.mk('u' || i) from generate_series(1, 5) i;
select set_config('request.headers', '{"x-forwarded-for": "9.9.9.9, 10.0.0.1"}', true);
do $$ declare i int; j int;
begin
  for i in 1 .. 4 loop
    perform pg_temp.login('u' || i);
    for j in 1 .. 5 loop perform public.join_group('ZZZZZ' || j); end loop;
    execute 'reset role';
  end loop;
end $$;
select pg_temp.login('u5');
select is((select public.join_group(pg_temp.code()) ->> 'error'), 'too_many_tries', 'IP limit blocks a fifth user on the same IP');
reset role;
select set_config('request.headers', '', true);
delete from public.join_attempts;

-- ---- preview shows only group and owner, never the roster
reset role; select pg_temp.login('luis');
select is((select array_agg(k order by k) from jsonb_object_keys(public.preview_group_code(lower(pg_temp.code()))) k),
          array['already_member', 'group_id', 'group_name', 'ok', 'owner_name'], 'preview exposes only group + owner');
select is((select public.preview_group_code(pg_temp.code()) ->> 'owner_name'), 'Maya', 'preview names the owner');
reset role;
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('luis')), 0, 'preview never adds anyone');

-- ---- removed + blocked member cannot rejoin
update public.group_members set removed_at = now(), blocked = true
 where group_id = pg_temp.gid() and user_id = pg_temp.uid('jordan');
select pg_temp.login('jordan');
select is((select public.join_group(pg_temp.code()) ->> 'error'), 'blocked', 'blocked member cannot rejoin');
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('jordan')
            and removed_at is not null), 1, 'removed member still sees their own row');
select is((select count(*)::int from public.groups where id = pg_temp.gid()), 0, 'removed member can no longer read the group');
reset role; select pg_temp.login('maya');
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('jordan')), 0,
          'roster no longer shows the removed member');
reset role;
update public.group_members set removed_at = null, blocked = false where user_id = pg_temp.uid('jordan');

-- ---- 30-member limit
select pg_temp.login('maya'); select public.create_group('Full group');
reset role;
select pg_temp.mk('f' || i) from generate_series(1, 29) i;
insert into public.group_members (group_id, user_id) select pg_temp.gid('Full group'), pg_temp.uid('f' || i) from generate_series(1, 29) i;
select pg_temp.login('tess');
select is((select public.join_group(pg_temp.code('Full group')) ->> 'error'), 'group_full', '31st member refused');
reset role;

-- ---- profiles
select pg_temp.mk('nobody');
delete from public.profiles where id = pg_temp.uid('nobody');
select pg_temp.login('nobody');
select throws_ok($$select public.join_group('ABCDEF')$$, 'P0001', 'profile_required', 'joining needs a display name first');
select lives_ok($$select public.set_profile('  Nobody  ')$$, 'set_profile creates a profile');
reset role;
select is((select display_name from public.profiles where id = pg_temp.uid('nobody')), 'Nobody', 'display name trimmed');
select pg_temp.login('nobody');
select throws_ok($$select public.set_profile('   ')$$, 'P0001', 'invalid_display_name', 'blank name rejected');
select throws_ok($$select public.set_profile(repeat('x', 61))$$, 'P0001', 'invalid_display_name', '61-char name rejected');
reset role;

-- ---- guest upgrade keeps the user id and flips is_guest
update auth.users set is_anonymous = false where id = pg_temp.uid('sam');
select is((select is_guest from public.profiles where id = pg_temp.uid('sam')), false, 'upgrading a guest clears is_guest');
select is((select count(*)::int from public.group_members where user_id = pg_temp.uid('sam')), 1, 'memberships survive the upgrade');
update auth.users set is_anonymous = true where id = pg_temp.uid('sam');

-- ---- visibility: members see the roster and code; outsiders see nothing
select pg_temp.login('jordan');
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid()), 3,
          'a guest member sees the roster (maya, jordan, sam)');
select is((select count(*)::int from public.join_codes), 1, 'a guest member sees the join code');
select is((select count(*)::int from public.profiles where id = pg_temp.uid('priya')), 0, 'no profile visibility without a shared group');
reset role; select pg_temp.login('tess');
select is((select count(*)::int from public.group_members where group_id = pg_temp.gid()), 0, 'non-member sees no roster');
select is((select count(*)::int from public.join_codes where group_id = pg_temp.gid()), 0, 'non-member does not see the code');
reset role;

select * from finish();
rollback;
