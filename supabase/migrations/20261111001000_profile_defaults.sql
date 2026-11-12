-- TEC-98 (P0-17 backend): the private usual budget and how the person gets around (spec-decision C5).
-- Both columns already exist on profiles, which is own-row-only (own_profile policy), and get_profile_cards
-- projects only name and photo, so nobody else can read them. No plan or snapshot copies them.
-- In Phase 1b the budget is stored and shown on the profile only; it does not prefill the price filter (C5).
begin;

-- A separate function rather than more arguments on set_profile: set_profile writes every profile field and
-- stores omitted ones as null, so adding these there would wipe them whenever the name is changed.
-- budget_cap: dollars per person, 0 to 1000, or null to clear. transport: walk, bike, transit, drive,
-- need_a_ride, or null to clear. Both replace the stored value. Errors never repeat the submitted values.
create function public.set_profile_defaults(budget_cap numeric default null, transport text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  uid := public.require_profile();
  if set_profile_defaults.budget_cap is not null and set_profile_defaults.budget_cap not between 0 and 1000 then
    raise exception 'invalid_budget' using errcode = 'P0001';
  end if;
  if set_profile_defaults.transport is not null
     and set_profile_defaults.transport not in ('walk', 'bike', 'transit', 'drive', 'need_a_ride') then
    raise exception 'invalid_transport' using errcode = 'P0001';
  end if;
  update public.profiles p
    set budget_cap = round(set_profile_defaults.budget_cap, 2), transport = set_profile_defaults.transport
    where p.id = uid;
end $$;
revoke all on function public.set_profile_defaults(numeric, text) from public, anon;
grant execute on function public.set_profile_defaults(numeric, text) to authenticated;
commit;
