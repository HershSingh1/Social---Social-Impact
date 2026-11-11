begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
create function pg_temp.id(text) returns uuid language sql immutable as 'select md5($1)::uuid';
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', pg_temp.id(u)::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(u))::text, true) $$;

insert into auth.users (id) select pg_temp.id(n) from unnest(array['maya','a','b','c','d','e','nameless']) n;
update profiles p set display_name = n from unnest(array['maya','a','b','c','d','e']) n where p.id = pg_temp.id(n);
insert into groups (id, name, owner_id, client_key) values
  (pg_temp.id('g'), 'Crew', pg_temp.id('maya'), pg_temp.id('g')),
  (pg_temp.id('g2'), 'Crew 2', pg_temp.id('maya'), pg_temp.id('g2'));
insert into group_members (group_id, user_id, role)
  select pg_temp.id('g'), pg_temp.id(n), case when n = 'maya' then 'owner' else 'member' end
  from unnest(array['maya','a','b','c','d','e']) n;
insert into group_members (group_id, user_id, role) values (pg_temp.id('g2'), pg_temp.id('maya'), 'owner');
insert into experiences (id, name, category, price_kind, timing_kind, source) values
  (pg_temp.id('clay'), 'Clay and conversation', 'Arts', 'exact', 'flexible', 'PLACEHOLDER: test'),
  (pg_temp.id('sketch'), 'Sketch and stroll', 'Arts', 'free', 'flexible', 'PLACEHOLDER: test'),
  (pg_temp.id('barton'), 'Barton Springs swim', 'Outdoors', 'free', 'flexible', 'PLACEHOLDER: test');

-- Pick with options in position order; options are named <pick><position>; optional starred position.
create function pg_temp.mk(p text, grp text, exps text[], star int, dl interval) returns void language plpgsql as $$
declare i int;
begin
  insert into picks (id, group_id, organizer_id, client_key, deadline, created_at)
    values (pg_temp.id(p), pg_temp.id(grp), pg_temp.id('maya'), pg_temp.id(p), now() + dl, now() - interval '2 hours');
  for i in 1..array_length(exps, 1) loop
    insert into pick_options (id, pick_id, experience_id, position)
      values (pg_temp.id(p || i), pg_temp.id(p), pg_temp.id(exps[i]), i);
  end loop;
  if star is not null then update picks set starred_option_id = pg_temp.id(p || star) where id = pg_temp.id(p); end if;
end $$;
-- Votes on option i from voters maya,a,b,c,d,e in order ('' = no vote).
create function pg_temp.vote(p text, i int, vals text[]) returns void language plpgsql as $$
declare k int; voters text[] := array['maya','a','b','c','d','e'];
begin
  for k in 1..array_length(vals, 1) loop
    if vals[k] <> '' then
      insert into votes (option_id, user_id, value) values (pg_temp.id(p || i), pg_temp.id(voters[k]), vals[k]);
    end if;
  end loop;
end $$;

-- Worked example (P0-09). Clay is first AND starred, so fewer No votes must beat both.
select pg_temp.mk('w', 'g', array['clay','sketch','barton'], 1, interval '1 day');
select pg_temp.vote('w', 1, array['yes','yes','yes','yes','no','no']);       -- 4 Yes, 2 No = 8
select pg_temp.vote('w', 2, array['yes','yes','yes','maybe','maybe','no']);  -- 3 Yes, 2 Maybe, 1 No = 8
select pg_temp.vote('w', 3, array['yes','yes','maybe','no','no','no']);      -- 2 Yes, 1 Maybe, 3 No = 5

set local role authenticated;
select pg_temp.as_user('a');
select throws_ok($$select public.close_pick(pg_temp.id('w'))$$, '42501', 'not_organizer', 'Members cannot close');
select throws_ok($$select public.cancel_pick(pg_temp.id('w'))$$, '42501', 'not_organizer', 'Members cannot cancel');
select pg_temp.as_user('nameless');
select throws_ok($$select public.close_pick(pg_temp.id('w'))$$, 'P0001', 'profile_required', 'Profile required to close');
select throws_ok($$select public.cancel_pick(pg_temp.id('w'))$$, 'P0001', 'profile_required', 'Profile required to cancel');
select throws_ok('select public.close_due_picks()', '42501', null, 'Clients cannot run the deadline job');
select pg_temp.as_user('maya');
select lives_ok($$select public.close_pick(pg_temp.id('w'))$$, 'Organizer closes before the deadline');
select is((select state from picks where id = pg_temp.id('w')), 'closed', 'Pick is closed');
select is((select winner_option_id from picks where id = pg_temp.id('w')), pg_temp.id('w2'), 'Sketch and stroll wins');
select is((select tie_rule from picks where id = pg_temp.id('w')),
  'Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2).', 'Tie-break sentence matches the spec');
reset role;
select is((select o.id from pick_options o join votes v on v.option_id = o.id where o.pick_id = pg_temp.id('w')
  group by o.id order by sum(case v.value when 'yes' then 2 when 'maybe' then 1 else 0 end) asc limit 1),
  pg_temp.id('w3'), 'Barton Springs is third with 5 points');
create temp table before_close as
  select closed_at, winner_option_id, tie_rule from picks where id = pg_temp.id('w');
grant select on before_close to authenticated;
set local role authenticated;
select pg_temp.as_user('maya');
select lives_ok($$select public.close_pick(pg_temp.id('w'))$$, 'Closing twice does not fail');
select is((select row(closed_at, winner_option_id, tie_rule) from picks where id = pg_temp.id('w')),
  (select row(closed_at, winner_option_id, tie_rule) from before_close), 'Closing twice changes nothing');

-- Cancel from Closed; again is a no-op; a cancelled pick cannot be closed
select lives_ok($$select public.cancel_pick(pg_temp.id('w'))$$, 'Organizer cancels a closed pick');
select is((select state from picks where id = pg_temp.id('w')), 'cancelled', 'Cancelled');
select lives_ok($$select public.cancel_pick(pg_temp.id('w'))$$, 'Cancelling twice is fine');
select throws_ok($$select public.close_pick(pg_temp.id('w'))$$, 'P0001', 'pick_cancelled', 'Cancelled pick cannot close');

-- Star, then position tie-breaks (both tied on points and No votes)
reset role;
select pg_temp.mk('s', 'g', array['clay','sketch'], 2, interval '1 day');
select pg_temp.vote('s', 1, array['yes','no','','','','']);
select pg_temp.vote('s', 2, array['yes','no','','','','']);
select pg_temp.mk('p', 'g2', array['clay','sketch'], null, interval '1 day');
select pg_temp.vote('p', 1, array['yes','','','','','']);
select pg_temp.vote('p', 2, array['yes','','','','','']);
set local role authenticated;
select pg_temp.as_user('maya');
select public.close_pick(pg_temp.id('s'));
select public.close_pick(pg_temp.id('p'));
select is((select tie_rule from picks where id = pg_temp.id('s')),
  'Tied at 2 points and 1 No votes. Sketch and stroll wins as the starred option.', 'Starred option breaks a tie');
select is((select tie_rule from picks where id = pg_temp.id('p')),
  'Tied on points, No votes and star. Clay and conversation wins because it was added first.', 'Position breaks the last tie');
select is((select winner_option_id from picks where id = pg_temp.id('p')), pg_temp.id('p1'), 'First added wins');
-- Plain win
reset role;
update picks set state = 'cancelled' where id in (pg_temp.id('s'), pg_temp.id('p'));
select pg_temp.mk('plain', 'g', array['clay','sketch'], null, interval '1 day');
select pg_temp.vote('plain', 1, array['yes','','','','','']);
set local role authenticated;
select pg_temp.as_user('maya');
select public.close_pick(pg_temp.id('plain'));
select is((select tie_rule from picks where id = pg_temp.id('plain')),
  'Clay and conversation wins with the most points (2).', 'Outright winner sentence');
select lives_ok($$select public.cancel_pick(pg_temp.id('plain'))$$, 'Cancel closed pick');

-- Deadline job: closes only due picks, once; nobody voted means no winner
reset role;
select pg_temp.mk('d', 'g', array['clay','sketch'], null, interval '1 minute');
select pg_temp.mk('late', 'g2', array['clay','sketch'], null, interval '1 hour');
select pg_temp.vote('d', 1, array['maybe','','','','','']);
update picks set deadline = now() - interval '1 second' where id = pg_temp.id('d');
select is(public.close_due_picks(), 1, 'Job closes the one due pick');
select is((select state from picks where id = pg_temp.id('d')), 'closed', 'Due pick closed by the job');
select is((select winner_option_id from picks where id = pg_temp.id('d')), pg_temp.id('d1'), 'Job picks the winner');
select is((select state from picks where id = pg_temp.id('late')), 'open', 'Not-due pick stays open');
select is(public.close_due_picks(), 0, 'Job runs once per pick');
update picks set deadline = now() - interval '1 second' where id = pg_temp.id('late');
select is(public.close_due_picks(), 1, 'Empty pick is due');
select is((select winner_option_id from picks where id = pg_temp.id('late')), null, 'Nobody voted: no winner');
select is((select state from picks where id = pg_temp.id('late')), 'closed', 'Nobody voted: still closes');
select is((select tie_rule from picks where id = pg_temp.id('late')),
  'Nobody voted. The organizer chooses an option.', 'Nobody-voted sentence');

-- Grants
select ok(not has_function_privilege('authenticated', 'public.close_due_picks()', 'EXECUTE'), 'authenticated cannot run close_due_picks');
select ok(not has_function_privilege('anon', 'public.close_pick(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cancel_pick(uuid)', 'EXECUTE'), 'anon cannot close or cancel');
select ok(has_function_privilege('authenticated', 'public.close_pick(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cancel_pick(uuid)', 'EXECUTE'), 'authenticated can close and cancel');
select * from finish();
rollback;
