-- TEC-110: the owner's Removed list (TEC-82) needs the names of people they removed. get_profile_cards only
-- returned people who still share an active group, so a removed person came back as "Removed member".
-- One extra rule: the group's current owner, while still an active member, sees people blocked from that
-- group (removed and not allowed back). Nobody else gains visibility, and Allow back ends it.
-- Same signature and columns, so `create or replace` keeps the existing grants.
begin;

create or replace function public.get_profile_cards(user_ids uuid[])
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
      -- Or the caller owns a group this person is blocked from (the owner's Removed list).
      or exists (
        select 1 from public.groups g
        join public.group_members mine on mine.group_id = g.id
        join public.group_members theirs on theirs.group_id = g.id
        where g.owner_id = (select auth.uid())
          and mine.user_id = g.owner_id and mine.removed_at is null and not mine.blocked
          and theirs.user_id = p.id and theirs.blocked)
      -- Or is on a sent plan the caller can read (organizer or active invitee).
      or exists (
        select 1 from public.plans pl
        where pl.state <> 'draft' and private.can_read_plan(pl.id)
          and (pl.organizer_id = p.id or exists (
            select 1 from public.rsvps r
            where r.plan_id = pl.id and r.user_id = p.id and r.removed_at is null)))
    );
$$;

commit;
