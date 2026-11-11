-- TEC-102: the only way a client reads other people's name and photo.
-- profiles stays own-row-only (budget_cap and transport are private); this projects
-- display_name and avatar_path only, for people the caller shares a group or a plan with.
begin;

create function public.get_profile_cards(user_ids uuid[])
returns table (user_id uuid, display_name text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_path
  from public.profiles p
  where p.id = any (coalesce(user_ids, '{}'::uuid[]))
    and (select auth.uid()) is not null
    and (
      p.id = (select auth.uid())
      -- Shares an active (not removed, not blocked) group with the caller.
      or exists (
        select 1 from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
        where mine.user_id = (select auth.uid()) and mine.removed_at is null and not mine.blocked
          and theirs.user_id = p.id and theirs.removed_at is null and not theirs.blocked)
      -- Or is on a sent plan the caller can read (organizer or active invitee).
      or exists (
        select 1 from public.plans pl
        where pl.state <> 'draft' and private.can_read_plan(pl.id)
          and (pl.organizer_id = p.id or exists (
            select 1 from public.rsvps r
            where r.plan_id = pl.id and r.user_id = p.id and r.removed_at is null)))
    );
$$;

revoke all on function public.get_profile_cards(uuid[]) from public, anon;
grant execute on function public.get_profile_cards(uuid[]) to authenticated;
commit;
