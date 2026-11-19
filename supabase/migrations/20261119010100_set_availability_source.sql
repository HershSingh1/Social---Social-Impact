-- TEC-136 part 2 (P1-02 backend, decision N13): set_availability can write a calendar answer.
-- The old two-argument function is replaced by one with an optional last parameter, the pattern N2 used for create_pick.
-- A two-argument call still works and means 'manual'.
--   source = 'calendar' needs a calendar_shares row for the pick's group (calendar_share_off), and never overwrites
--   a manual answer. status = null with source = 'calendar' clears only a calendar row.
--   Any other source is refused (invalid_source).
-- Only the Free or Busy answer arrives here; no calendar contents reach the server (rule 8).
begin;

drop function public.set_availability(uuid, text);
create function public.set_availability(option_id uuid, status text, source text default 'manual') returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; pk public.picks; pid uuid;
begin
  perform public.require_profile();
  uid := (select auth.uid());
  if source is null or source not in ('manual', 'calendar') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if status is not null and status not in ('free', 'busy') then
    raise exception 'invalid_availability' using errcode = 'P0001';
  end if;
  select o.pick_id into pid from public.pick_options o where o.id = set_availability.option_id;
  if pid is null then raise exception 'option_not_found' using errcode = 'P0001'; end if;
  -- Same lock as cast_vote: answers and close_pick on one pick run one at a time.
  select * into pk from public.picks p where p.id = pid for update;
  if not private.is_group_member(pk.group_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not pk.availability_enabled then raise exception 'availability_off' using errcode = 'P0001'; end if;
  if pk.state <> 'open' or pk.deadline <= now() then raise exception 'voting_closed' using errcode = 'P0001'; end if;
  if source = 'calendar' and not exists (
    select 1 from public.calendar_shares s where s.user_id = uid and s.group_id = pk.group_id
  ) then
    raise exception 'calendar_share_off' using errcode = 'P0001';
  end if;

  if source = 'manual' then
    if status is null then
      delete from public.availability a where a.option_id = set_availability.option_id and a.user_id = uid;
    else
      insert into public.availability (option_id, user_id, status, source)
        values (set_availability.option_id, uid, status, 'manual')
      on conflict on constraint availability_pkey do update
        set status = excluded.status, source = 'manual', updated_at = now()
        where public.availability.status is distinct from excluded.status or public.availability.source <> 'manual';
    end if;
  else
    if status is null then
      delete from public.availability a
        where a.option_id = set_availability.option_id and a.user_id = uid and a.source = 'calendar';
    else
      -- A row the person set by hand is left alone; only a missing or calendar row is written.
      insert into public.availability (option_id, user_id, status, source)
        values (set_availability.option_id, uid, status, 'calendar')
      on conflict on constraint availability_pkey do update
        set status = excluded.status, updated_at = now()
        where public.availability.source = 'calendar' and public.availability.status is distinct from excluded.status;
    end if;
  end if;
end $$;
revoke all on function public.set_availability(uuid, text, text) from public, anon;
grant execute on function public.set_availability(uuid, text, text) to authenticated;

commit;
