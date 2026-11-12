-- TEC-88 (P0-10): the organizer of a closed pick plans another option instead of the vote winner.
-- Passing the winner clears the override, so the organizer can go back to the vote result.
-- Members read picks.override_option_id through the existing picks RLS (core migration).
begin;

create function public.override_pick(pick_id uuid, option_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  p public.picks;
begin
  perform public.require_profile();
  uid := (select auth.uid());

  select * into p from public.picks where id = override_pick.pick_id for update;
  if not found or p.organizer_id <> uid then
    raise exception 'not_organizer' using errcode = '42501';
  end if;
  if p.state <> 'closed' then
    raise exception 'pick_not_closed' using errcode = 'P0001';
  end if;
  if p.winner_option_id is null then
    raise exception 'no_winner' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.pick_options o where o.pick_id = p.id and o.id = override_pick.option_id
  ) then
    raise exception 'option_not_found' using errcode = 'P0001';
  end if;

  update public.picks
     set override_option_id = nullif(override_pick.option_id, p.winner_option_id)
   where id = p.id;
end $$;

revoke all on function public.override_pick(uuid, uuid) from public, anon;
grant execute on function public.override_pick(uuid, uuid) to authenticated;
commit;
