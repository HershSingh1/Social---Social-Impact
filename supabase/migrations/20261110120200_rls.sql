-- Row-level security, matching the spec's "Row-level security in one line each". Select policies only:
-- nobody writes tables directly, every write goes through the RPCs.
-- One deliberate difference: `votes` is readable only by its owner so "who voted what" is never exposed;
-- members read tallies from option_tallies / pick_voter_status instead (see docs/progress.md).

alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.join_codes        enable row level security;
alter table public.experiences       enable row level security;
alter table public.saves             enable row level security;
alter table public.picks             enable row level security;
alter table public.pick_options      enable row level security;
alter table public.votes             enable row level security;
alter table public.plans             enable row level security;
alter table public.plan_revisions    enable row level security;
alter table public.rsvps             enable row level security;
alter table public.plan_links        enable row level security;
alter table public.submissions       enable row level security;
alter table public.listing_reports   enable row level security;
alter table public.option_tallies    enable row level security;
alter table public.pick_voter_status enable row level security;
alter table public.join_attempts     enable row level security;   -- no policy: server only

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_group(id) or private.shares_plan(id));

create policy groups_select on public.groups for select to authenticated
  using (private.is_member(id));

-- a member sees the active roster; a removed member still sees their own row ("You're no longer in this group")
create policy group_members_select on public.group_members for select to authenticated
  using (user_id = auth.uid() or (removed_at is null and private.is_member(group_id)));

create policy join_codes_select on public.join_codes for select to authenticated
  using (private.is_member(group_id));

create policy experiences_select on public.experiences for select to authenticated
  using (true);

create policy saves_select on public.saves for select to authenticated
  using (user_id = auth.uid() or (group_id is not null and private.is_member(group_id)));

create policy picks_select on public.picks for select to authenticated
  using (private.is_member(group_id));

create policy pick_options_select on public.pick_options for select to authenticated
  using (private.is_member(private.pick_group(pick_id)));

create policy votes_select_own on public.votes for select to authenticated
  using (user_id = auth.uid());

create policy option_tallies_select on public.option_tallies for select to authenticated
  using (private.is_member(private.pick_group(pick_id)));

create policy pick_voter_status_select on public.pick_voter_status for select to authenticated
  using (private.is_member(private.pick_group(pick_id)));

-- Group membership never grants access to a plan: only invitees (and the organizer) read it.
create policy plans_select on public.plans for select to authenticated
  using (organizer_id = auth.uid() or (state <> 'draft' and private.is_plan_invitee(id)));

create policy plan_revisions_select on public.plan_revisions for select to authenticated
  using (private.is_plan_organizer(plan_id) or private.is_plan_invitee(plan_id));

create policy rsvps_select on public.rsvps for select to authenticated
  using (private.is_plan_invitee(plan_id));

create policy plan_links_select on public.plan_links for select to authenticated
  using (private.is_plan_organizer(plan_id));

create policy submissions_select on public.submissions for select to authenticated
  using (author_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer');

create policy listing_reports_select on public.listing_reports for select to authenticated
  using (user_id = auth.uid());
