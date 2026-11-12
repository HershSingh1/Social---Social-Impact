-- TEC-79 (P0-02 backend): delete_account(). Removes the caller's personal data, hands owned groups to the
-- longest-standing member (G8) or archives them, cancels plans and picks they organized, then deletes the auth
-- user last, all in one transaction.
begin;

-- Groups, picks and plans outlive the person who made them: invitees keep seeing a cancelled plan and its reason,
-- and a group with other members keeps its history. Their owner/organizer pointer therefore has to be able to
-- become null once the profile row is gone. Every existing function that compares these columns is followed by a
-- state check that a cancelled/planned/archived row fails (covered in delete_account.test.sql).
alter table public.groups alter column owner_id drop not null;
alter table public.picks alter column organizer_id drop not null;
alter table public.plans alter column organizer_id drop not null;

-- Order matters: groups first (needs the caller's membership to still exist), then plans and picks they
-- organized, then their votes, RSVPs and memberships, then the profile, then the auth user.
-- Calling it again after success is a no-op (the profile row is gone). Saves (TEC-86) cascade from profiles.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  g record;
  successor uuid;
  gone uuid[];
begin
  if uid is null or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Serialises two taps of "Delete account"; the second sees no profile and returns.
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then return; end if;

  -- 1. Owned groups (G8): longest-standing active member takes over, never a removed or blocked one.
  --    Nobody left: archive, close the join code, and leave the group without an owner.
  for g in select x.id from public.groups x where x.owner_id = uid order by x.id for update loop
    select m.user_id into successor from public.group_members m
      where m.group_id = g.id and m.user_id <> uid and m.removed_at is null and not m.blocked
      order by m.joined_at, m.user_id limit 1;
    if successor is not null then
      update public.groups set owner_id = successor where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = successor;
    else
      update public.groups set owner_id = null, archived_at = coalesce(archived_at, now()) where id = g.id;
      update public.join_codes set revoked_at = now() where group_id = g.id and revoked_at is null;
    end if;
  end loop;

  -- 2. Plans they organized. Unsent drafts are deleted; sent plans are cancelled for the invitees.
  delete from private.send_plan_requests where user_id = uid;
  delete from public.rsvps r using public.plans p
    where r.plan_id = p.id and p.organizer_id = uid and p.state = 'draft';
  delete from public.plan_revisions v using public.plans p
    where v.plan_id = p.id and p.organizer_id = uid and p.state = 'draft';
  delete from public.plans where organizer_id = uid and state = 'draft';
  update public.plans set state = 'cancelled', cancel_reason = 'Organizer deleted their account', updated_at = now()
    where organizer_id = uid and state = 'sent';
  update public.plans set organizer_id = null where organizer_id = uid;

  -- 3. Picks they organized: still-undecided picks are cancelled (nobody is left to close or plan them);
  --    planned picks keep their link to the plan.
  update public.picks set state = 'cancelled' where organizer_id = uid and state in ('open', 'closed');
  update public.picks set organizer_id = null where organizer_id = uid;

  -- 4. Their votes. Live tallies on open picks are recounted (open picks are locked first, like cast_vote does);
  --    tallies on closed picks stay, so they keep matching the stored winner and tie sentence.
  perform 1 from public.picks p
    where p.state = 'open' and exists (
      select 1 from public.pick_options o join public.votes v on v.option_id = o.id
      where o.pick_id = p.id and v.user_id = uid)
    order by p.id for update;
  -- (A separate statement: a CTE delete and the recount would share one snapshot and still count her votes.)
  with d as (delete from public.votes where user_id = uid returning option_id)
  select coalesce(array_agg(option_id), '{}') into gone from d;
  update public.option_tallies t set
    yes = (select count(*) from public.votes v where v.option_id = t.option_id and v.value = 'yes'),
    maybe = (select count(*) from public.votes v where v.option_id = t.option_id and v.value = 'maybe'),
    no = (select count(*) from public.votes v where v.option_id = t.option_id and v.value = 'no')
  where t.option_id = any (gone)
    and exists (select 1 from public.pick_options o join public.picks p on p.id = o.pick_id
                where o.id = t.option_id and p.state = 'open');
  delete from public.pick_voter_status where user_id = uid;

  -- 5. RSVPs, group memberships (every row, including removed or blocked ones), rate-limit counters.
  delete from public.rsvps where user_id = uid;
  delete from public.group_members where user_id = uid;
  delete from public.join_attempts where user_id = uid;

  -- 6. Profile, then the auth user last (profiles.id references auth.users). Sessions and identities cascade.
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
commit;
