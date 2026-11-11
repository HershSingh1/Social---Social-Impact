begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';

-- Stand-in for TEC-26's public.require_profile() when it is not on this base; rolled back with the test.
do $$ begin
  if to_regprocedure('public.require_profile()') is null then
    create function public.require_profile() returns uuid language plpgsql security definer set search_path = '' as $f$
    begin
      if not exists (select 1 from public.profiles where id = (select auth.uid()) and display_name is not null) then
        raise exception 'profile_required' using errcode = '42501';
      end if;
      return (select auth.uid());
    end $f$;
    grant execute on function public.require_profile() to authenticated;
  end if;
end $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','jordan','nameless','busy']) n;
insert into profiles (id, display_name) select pg_temp.id(n), n from unnest(array['maya','jordan','busy']) n;
insert into profiles (id) values (pg_temp.id('nameless'));

select ok(not has_function_privilege('anon', 'public.create_group(uuid,text)', 'execute'), 'Signed-out cannot execute create_group');
select ok(has_function_privilege('authenticated', 'public.create_group(uuid,text)', 'execute'), 'Signed-in can execute create_group');
select ok(not has_function_privilege('authenticated', 'private.new_join_code()', 'execute'), 'Code generator is not callable by clients');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.create_group(uuid,text)'::regprocedure),
  'create_group is definer with a fixed search_path');

set local role anon;
select throws_ok($$select public.create_group(gen_random_uuid(), 'x')$$, '42501', null, 'anon rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id('maya')::text, true);

create temp table r1 as select public.create_group(pg_temp.id('k1'), '  Saturday crew  ') as j;
grant all on r1 to authenticated;
select is((select j->>'code' ~ '^[A-HJ-NP-Z2-9]{6}$' from r1), true, 'Code is 6 allowed characters');
select is((select (j->>'expires_at')::timestamptz between now() + interval '14 days' - interval '1 minute'
  and now() + interval '14 days' + interval '1 minute' from r1), true, 'Code lasts 14 days');
select is((select name from groups where id = (select (j->>'group_id')::uuid from r1)), 'Saturday crew', 'Name is trimmed');
select results_eq($$select user_id, role from group_members$$, $$values (pg_temp.id('maya'), 'owner')$$, 'Creator is the only member, as owner');
select is((select owner_id from groups), pg_temp.id('maya'), 'Creator owns the group');
select is((select count(*) from join_codes where revoked_at is null), 1::bigint, 'One active code');

-- Retry with the same key returns the same group and code, and creates nothing new.
select is((select public.create_group(pg_temp.id('k1'), 'Saturday crew')), (select j from r1), 'Same key returns same result');
select is((select count(*) from groups), 1::bigint, 'Retry did not duplicate the group');
select is((select count(*) from join_codes), 1::bigint, 'Retry did not add a code');
-- A retry with a different name still returns the original group.
select is((select public.create_group(pg_temp.id('k1'), 'Other name')->>'group_id'), (select j->>'group_id' from r1), 'Retry ignores a changed name');

select throws_ok($$select public.create_group(pg_temp.id('k2'), '')$$, '22023', 'invalid_name', 'Empty name rejected');
select throws_ok($$select public.create_group(pg_temp.id('k2'), '   ')$$, '22023', 'invalid_name', 'Blank name rejected');
select throws_ok($$select public.create_group(pg_temp.id('k2'), null)$$, '22023', 'invalid_name', 'Null name rejected');
select throws_ok(format($$select public.create_group(pg_temp.id('k2'), %L)$$, repeat('a', 51)), '22023', 'invalid_name', '51 characters rejected');
select lives_ok(format($$select public.create_group(pg_temp.id('k3'), %L)$$, repeat('a', 50)), '50 characters accepted');
select throws_ok($$select public.create_group(null, 'x')$$, '22023', 'client_key_required', 'Missing client_key rejected');
select is((select count(*) from groups), 2::bigint, 'Rejected calls created nothing');

-- Codes are unique across groups.
select is((select count(distinct code) from join_codes), (select count(*) from join_codes), 'Codes are distinct');
select throws_ok($$insert into join_codes values ('ABCDEF', gen_random_uuid(), now(), null)$$, '42501', null, 'Clients cannot write codes directly');

-- Someone else's key is refused and reveals nothing.
select set_config('request.jwt.claim.sub', pg_temp.id('jordan')::text, true);
select throws_ok($$select public.create_group(pg_temp.id('k1'), 'Mine')$$, '42501', 'client_key_in_use', 'Another person cannot reuse a key');
select is((select count(*) from groups), 0::bigint, 'Jordan sees no groups they are not in');
-- Profile rule.
select set_config('request.jwt.claim.sub', pg_temp.id('nameless')::text, true);
select throws_ok($$select public.create_group(pg_temp.id('k9'), 'x')$$, '42501', 'profile_required', 'Profile required before creating');

-- Limit of 20 groups per person (the 21st fails; a retry of an existing key still works).
select set_config('request.jwt.claim.sub', pg_temp.id('busy')::text, true);
select public.create_group(gen_random_uuid(), 'g' || n) from generate_series(1, 20) n;
select is((select count(*) from group_members), 20::bigint, '20 groups created');
select throws_ok($$select public.create_group(gen_random_uuid(), 'one too many')$$, '53400', 'group_limit_reached', '21st group rejected');
select lives_ok($$select public.create_group((select client_key from groups limit 1), 'again')$$, 'Retry of an existing group is not blocked by the limit');
reset role;
select is((select count(*) from groups where owner_id = pg_temp.id('busy')), 20::bigint, 'Still 20 groups');
-- Archived groups no longer count.
update groups set archived_at = now() where id = (select id from groups where owner_id = pg_temp.id('busy') limit 1);
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id('busy')::text, true);
select lives_ok($$select public.create_group(gen_random_uuid(), 'after archive')$$, 'Archived group frees a slot');
reset role;

-- One active code per group is enforced by the database.
select throws_ok($$insert into join_codes select 'ZZZZZZ', group_id, now() + interval '1 day', null from join_codes limit 1$$,
  '23505', null, 'Second active code for a group is rejected');
select * from finish();
rollback;
