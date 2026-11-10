-- TEC-3: read-only client contract. Feature RPCs maintain aggregates and invariants.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null check (length(trim(display_name)) > 0),
  avatar_path text, budget_cap numeric check (budget_cap >= 0), transport text
);
create table public.groups (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 50),
  owner_id uuid not null references public.profiles(id), archived_at timestamptz,
  client_key uuid not null unique
);
create table public.group_members (
  group_id uuid references public.groups(id), user_id uuid references public.profiles(id),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(), removed_at timestamptz, blocked boolean not null default false,
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members(user_id, group_id);
create table public.join_codes (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  group_id uuid not null references public.groups(id), expires_at timestamptz not null, revoked_at timestamptz
);
create index join_codes_group on public.join_codes(group_id);
create table public.experiences (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null,
  description text not null default '' check (length(description) <= 2000),
  lat double precision check (lat between -90 and 90), lng double precision check (lng between -180 and 180),
  area text, image_url text, address text, provider_name text,
  price_kind text not null check (price_kind in ('exact', 'estimated', 'free', 'unknown')),
  price_min numeric check (price_min >= 0), price_max numeric check (price_max >= price_min),
  timing_kind text not null check (timing_kind in ('fixed', 'flexible', 'unknown')),
  sessions jsonb, hours_text text, duration_min integer check (duration_min > 0), meeting_point text,
  booking_required boolean not null default false, booking_url text,
  source text not null, checked_on date, status text not null default 'published', version integer not null default 1
);
create table public.picks (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id),
  organizer_id uuid not null references public.profiles(id), client_key uuid not null unique,
  title text not null default 'What should we do?', created_at timestamptz not null default now(),
  deadline timestamptz not null, closed_at timestamptz,
  state text not null default 'open' check (state in ('open', 'closed', 'planned', 'cancelled')),
  starred_option_id uuid, winner_option_id uuid, override_option_id uuid, tie_rule text
);
create unique index one_open_pick on public.picks(group_id) where state = 'open';
create table public.pick_options (
  id uuid primary key default gen_random_uuid(), pick_id uuid not null references public.picks(id),
  experience_id uuid not null references public.experiences(id), proposed_start timestamptz,
  position integer not null check (position between 1 and 5), unique (pick_id, position), unique (pick_id, id)
);
alter table public.picks
  add foreign key (id, starred_option_id) references public.pick_options(pick_id, id) deferrable initially deferred,
  add foreign key (id, winner_option_id) references public.pick_options(pick_id, id) deferrable initially deferred,
  add foreign key (id, override_option_id) references public.pick_options(pick_id, id) deferrable initially deferred;
create table public.votes (
  option_id uuid references public.pick_options(id), user_id uuid references public.profiles(id),
  value text not null check (value in ('yes', 'maybe', 'no')), primary key (option_id, user_id)
);
create table public.option_tallies (
  option_id uuid primary key references public.pick_options(id),
  yes integer not null default 0 check (yes >= 0), maybe integer not null default 0 check (maybe >= 0),
  no integer not null default 0 check (no >= 0)
);
create table public.pick_voter_status (
  pick_id uuid references public.picks(id), user_id uuid references public.profiles(id),
  complete boolean not null default false, primary key (pick_id, user_id)
);
create table public.plans (
  id uuid primary key default gen_random_uuid(), group_id uuid references public.groups(id),
  organizer_id uuid not null references public.profiles(id), experience_id uuid references public.experiences(id) on delete set null,
  experience_name text not null, experience_category text not null, pick_id uuid references public.picks(id),
  state text not null check (state in ('draft', 'sent', 'cancelled')),
  current_revision integer not null check (current_revision > 0), client_key uuid not null unique,
  cancel_reason text, updated_at timestamptz not null default now()
);
create table public.plan_revisions (
  plan_id uuid references public.plans(id), revision integer check (revision > 0),
  start_at timestamptz not null, end_at timestamptz not null check (end_at > start_at),
  time_zone text not null default 'America/Chicago' check (time_zone = 'America/Chicago'),
  meeting_point text not null, note text, price_snapshot jsonb not null, booking_required boolean not null,
  primary key (plan_id, revision)
);
alter table public.plans add foreign key (id, current_revision)
  references public.plan_revisions(plan_id, revision) deferrable initially deferred;
create table public.rsvps (
  plan_id uuid references public.plans(id), user_id uuid references public.profiles(id),
  status text not null check (status in ('going', 'cant_go', 'awaiting', 'needs_reconfirm')),
  revision integer not null, removed_at timestamptz, primary key (plan_id, user_id),
  foreign key (plan_id, revision) references public.plan_revisions(plan_id, revision)
);
create index rsvps_user on public.rsvps(user_id, plan_id);
-- Stores counters only: never raw invite codes. Future join RPC updates atomically.
create table public.join_attempts (
  user_id uuid primary key references public.profiles(id), window_start timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0), blocked_until timestamptz
);

-- Definer helpers prevent recursive RLS on membership and RSVP tables.
-- No caller-supplied identity, fixed search_path, private (non-API) schema.
create function private.is_group_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = target
    and m.user_id = (select auth.uid()) and m.removed_at is null and not m.blocked);
$$;
create function private.can_read_plan(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plans p where p.id = target and
    (p.organizer_id = (select auth.uid()) or (p.state <> 'draft' and exists (
      select 1 from public.rsvps r where r.plan_id = p.id and r.user_id = (select auth.uid())
      and r.removed_at is null))));
$$;
revoke all on function private.is_group_member(uuid), private.can_read_plan(uuid) from public, anon;
grant execute on function private.is_group_member(uuid), private.can_read_plan(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','groups','group_members','join_codes','experiences','picks',
    'pick_options','votes','option_tallies','pick_voter_status','plans','plan_revisions','rsvps','join_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    if t <> 'join_attempts' then execute format('grant select on public.%I to authenticated', t); end if;
  end loop;
end $$;
-- Budgets and transport are private. Roster RPCs must project name/avatar only.
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy member_groups on public.groups for select to authenticated using (private.is_group_member(id));
create policy member_roster on public.group_members for select to authenticated using (private.is_group_member(group_id));
create policy member_codes on public.join_codes for select to authenticated using (private.is_group_member(group_id));
create policy catalog on public.experiences for select to authenticated using (status = 'published');
create policy member_picks on public.picks for select to authenticated using (private.is_group_member(group_id));
create policy member_options on public.pick_options for select to authenticated
  using (exists (select 1 from public.picks p where p.id = pick_id));
create policy own_votes on public.votes for select to authenticated using (user_id = (select auth.uid()));
create policy member_tallies on public.option_tallies for select to authenticated
  using (exists (select 1 from public.pick_options o where o.id = option_id));
create policy member_voter_status on public.pick_voter_status for select to authenticated
  using (exists (select 1 from public.picks p where p.id = pick_id));
create policy invited_plans on public.plans for select to authenticated using (private.can_read_plan(id));
create policy invited_revisions on public.plan_revisions for select to authenticated using (private.can_read_plan(plan_id));
create policy invited_rsvps on public.rsvps for select to authenticated using (private.can_read_plan(plan_id));

-- Publish only public aggregates, never individual votes or join attempts.
alter publication supabase_realtime add table public.group_members, public.picks, public.pick_options,
  public.option_tallies, public.pick_voter_status, public.plans, public.plan_revisions, public.rsvps;
commit;
