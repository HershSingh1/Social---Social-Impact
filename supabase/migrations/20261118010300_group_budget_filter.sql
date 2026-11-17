-- TEC-131 (P1-05 backend): opt in to the group budget filter without revealing any cap (spec-decisions C5, N5).
-- profiles stays own-row-only, so budget_opt_in is as private as budget_cap. The only way a budget reaches a
-- group is group_budget_hidden, which answers with experience ids to hide and never with an amount.
begin;

alter table public.profiles add column budget_opt_in boolean not null default false;

-- A small separate function instead of a third argument on set_profile_defaults: that function's signature is
-- a contract and its null arguments clear the stored values, so a new argument would change what old calls do.
-- Opting in without a budget is allowed; the person simply doesn't count until a budget is set.
create function public.set_budget_opt_in(opt_in boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  uid := public.require_profile();
  if set_budget_opt_in.opt_in is null then
    raise exception 'invalid_opt_in' using errcode = 'P0001';
  end if;
  update public.profiles p set budget_opt_in = set_budget_opt_in.opt_in where p.id = uid;
end $$;
revoke all on function public.set_budget_opt_in(boolean) from public, anon;
grant execute on function public.set_budget_opt_in(boolean) to authenticated;

-- Which of these activities cost more than the group's lowest opted-in cap. Only members who opted in and have
-- a cap count. With fewer than 3 of them it returns null, so a lone member's cap can't be read off the answer.
-- Free activities and ones with an unknown price are never listed; a price range is listed only when even its
-- lowest price is above the cap. Ids that aren't published catalog rows are ignored. Errors carry no values.
create function public.group_budget_hidden(group_id uuid, experience_ids uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid;
  lowest numeric;
  counted integer;
begin
  uid := public.require_profile();
  if not private.is_group_member(group_budget_hidden.group_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if cardinality(group_budget_hidden.experience_ids) > 500 then
    raise exception 'too_many_experiences' using errcode = 'P0001';
  end if;

  select min(p.budget_cap), count(*) into lowest, counted
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  where m.group_id = group_budget_hidden.group_id and m.removed_at is null and not m.blocked
    and p.budget_opt_in and p.budget_cap is not null;
  if counted < 3 then return null; end if;

  return coalesce((
    select array_agg(e.id order by e.id)
    from public.experiences e
    where e.id = any (coalesce(group_budget_hidden.experience_ids, '{}'))
      and e.status = 'published' and e.price_kind in ('exact', 'estimated')
      and e.price_min > lowest
  ), '{}');
end $$;
revoke all on function public.group_budget_hidden(uuid, uuid[]) from public, anon;
grant execute on function public.group_budget_hidden(uuid, uuid[]) to authenticated;
commit;
