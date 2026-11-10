-- M1: all P0 tables from the spec's "Data model" (docs/spec.md), exactly as listed.
-- Spec tables get no extra columns. Three helper tables the spec does not list are added at the bottom
-- (option_tallies, pick_voter_status, join_attempts); see docs/progress.md.
-- Every table has RLS enabled in the next migrations; clients never write tables directly.

-- ---------------------------------------------------------------- people and groups
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  avatar_path   text,
  is_guest      boolean not null default true,
  budget_cap    numeric(8, 2) check (budget_cap is null or budget_cap >= 0),
  transport     text check (transport in ('walk', 'bike', 'transit', 'drive', 'need_ride')),
  constraint profiles_display_name_ok
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 60)
);

create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_id     uuid not null references public.profiles (id),
  archived_at  timestamptz,
  constraint groups_name_ok check (name = btrim(name) and char_length(name) between 1 and 50)
);

-- `role` is listed in P0-03's data line but not in the Data model table; included (see progress.md).
create table public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  joined_at   timestamptz not null default now(),
  removed_at  timestamptz,
  blocked     boolean not null default false,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.join_codes (
  code        text primary key
              check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),  -- A-Z and 2-9, no 0 O 1 I
  group_id    uuid not null references public.groups (id) on delete cascade,
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
-- one active (not revoked) code per group
create unique index join_codes_one_active on public.join_codes (group_id) where revoked_at is null;

-- ---------------------------------------------------------------- catalog
create table public.experiences (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  category              text not null,
  description           text not null,
  lat                   double precision not null check (lat between -90 and 90),
  lng                   double precision not null check (lng between -180 and 180),
  area                  text not null,
  price_kind            text not null check (price_kind in ('exact', 'estimated', 'free', 'unknown')),
  price_min             numeric(8, 2),
  price_max             numeric(8, 2),
  timing_kind           text not null check (timing_kind in ('fixed', 'flexible', 'unknown')),
  sessions              jsonb,
  hours_text            text,
  duration_min          integer check (duration_min > 0),
  meeting_point         text not null,
  booking_required      boolean not null default false,
  booking_url           text,
  booking_url_referral  text,                         -- P2-09, unused before P2
  source                text not null,
  checked_on            date not null,
  status                text not null default 'active' check (status in ('active', 'removed')),
  version               integer not null default 1,
  constraint experiences_name_ok check (name = btrim(name) and char_length(name) between 1 and 100),
  constraint experiences_category_ok check (category in
    ('art_walks', 'make', 'outdoors', 'food_drink', 'games_trivia', 'music_film', 'active')),
  constraint experiences_description_ok check (char_length(description) <= 2000),
  constraint experiences_meeting_point_ok check (char_length(meeting_point) between 1 and 200),
  constraint experiences_price_ok check (
    (price_kind = 'unknown'   and price_min is null and price_max is null) or
    (price_kind = 'free'      and price_min = 0 and price_max = 0) or
    (price_kind = 'exact'     and price_min is not null and price_min = price_max and price_min >= 0) or
    (price_kind = 'estimated' and price_min is not null and price_max is not null
                              and price_min >= 0 and price_max >= price_min)
  ),
  constraint experiences_timing_ok check (
    (timing_kind = 'fixed' and jsonb_typeof(sessions) = 'array' and jsonb_array_length(sessions) > 0) or
    (timing_kind <> 'fixed')
  ),
  constraint experiences_booking_url_ok check (
    (booking_url is null or booking_url ~ '^https?://') and
    (booking_url_referral is null or booking_url_referral ~ '^https?://')
  )
);
create index experiences_category_idx on public.experiences (category);

create table public.saves (
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  group_id       uuid references public.groups (id) on delete cascade,   -- null = personal save
  unique nulls not distinct (experience_id, user_id, group_id)
);

-- ---------------------------------------------------------------- group pick
create table public.picks (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  organizer_id       uuid not null references public.profiles (id),
  deadline           timestamptz not null,
  starred_option_id  uuid,
  state              text not null default 'open' check (state in ('open', 'closed', 'planned', 'cancelled')),
  winner_option_id   uuid,
  tie_rule           text,        -- the sentence shown on the result screen, e.g. "Tied at 8 points. ..."
  override_option_id uuid
);
-- one open pick per group at a time
create unique index picks_one_open_per_group on public.picks (group_id) where state = 'open';
create index picks_group_idx on public.picks (group_id);

create table public.pick_options (
  id              uuid primary key default gen_random_uuid(),
  pick_id         uuid not null references public.picks (id) on delete cascade,
  experience_id   uuid not null references public.experiences (id),
  proposed_start  timestamptz,
  position        integer not null check (position >= 1),
  unique (pick_id, position)
);

alter table public.picks
  add constraint picks_starred_fk  foreign key (starred_option_id)  references public.pick_options (id) on delete set null,
  add constraint picks_winner_fk   foreign key (winner_option_id)   references public.pick_options (id) on delete set null,
  add constraint picks_override_fk foreign key (override_option_id) references public.pick_options (id) on delete set null;

create table public.votes (
  option_id  uuid not null references public.pick_options (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  value      text not null check (value in ('yes', 'maybe', 'no')),
  primary key (option_id, user_id)
);
create index votes_user_idx on public.votes (user_id);

-- ---------------------------------------------------------------- plans
create table public.plans (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups (id) on delete cascade,
  organizer_id      uuid not null references public.profiles (id),
  experience_id     uuid not null references public.experiences (id),
  pick_id           uuid references public.picks (id),
  state             text not null default 'draft' check (state in ('draft', 'sent', 'cancelled')),
  current_revision  integer not null default 1 check (current_revision >= 1),
  client_key        uuid unique,
  cancel_reason     text,
  repeat_rule       text                       -- P2-04, unused before P2
);
create index plans_group_idx on public.plans (group_id);

create table public.plan_revisions (
  plan_id           uuid not null references public.plans (id) on delete cascade,
  revision          integer not null check (revision >= 1),
  start_at          timestamptz not null,      -- UTC
  end_at            timestamptz not null,      -- UTC
  time_zone         text not null default 'America/Chicago',
  meeting_point     text not null,
  note              text,
  price_snapshot    jsonb not null,
  booking_required  boolean not null,
  primary key (plan_id, revision),
  constraint plan_revisions_end_after_start check (end_at > start_at),
  constraint plan_revisions_meeting_point_ok check (char_length(meeting_point) between 1 and 200),
  constraint plan_revisions_note_ok check (note is null or char_length(note) <= 500)
);

create table public.rsvps (
  plan_id     uuid not null references public.plans (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      text not null check (status in ('going', 'cant_go', 'awaiting', 'needs_reconfirm')),
  revision    integer not null,               -- revision this answer was given against
  removed_at  timestamptz,
  primary key (plan_id, user_id)
);
create index rsvps_user_idx on public.rsvps (user_id);

create table public.plan_links (               -- P0-13 (pilot): table only, no functions yet
  token       text primary key,
  plan_id     uuid not null references public.plans (id) on delete cascade,
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);

-- ---------------------------------------------------------------- listings (P0-18, pilot): tables only
create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles (id) on delete cascade,
  experience_id  uuid references public.experiences (id),
  payload        jsonb not null,
  state          text not null default 'pending'
                 check (state in ('pending', 'approved', 'needs_changes', 'rejected')),
  reason         text,
  reviewer_id    uuid references public.profiles (id),
  client_key     uuid unique
);

create table public.listing_reports (
  id             uuid primary key default gen_random_uuid(),
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  version        integer not null,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  issue          text not null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- helper tables (NOT in the spec)
-- Live vote tallies and "who has voted" without exposing who voted what (votes stay private per user).
create table public.option_tallies (
  option_id  uuid primary key references public.pick_options (id) on delete cascade,
  pick_id    uuid not null references public.picks (id) on delete cascade,
  yes        integer not null default 0,
  maybe      integer not null default 0,
  no         integer not null default 0
);
create index option_tallies_pick_idx on public.option_tallies (pick_id);

-- complete = the member has voted on every option of the pick ("5 of 6 voted")
create table public.pick_voter_status (
  pick_id   uuid not null references public.picks (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  complete  boolean not null default false,
  primary key (pick_id, user_id)
);

-- Failed join-code lookups, for "5 wrong tries per minute" (P0-01). No client access at all.
create table public.join_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid,
  ip            text,
  attempted_at  timestamptz not null default now()
);
create index join_attempts_user_idx on public.join_attempts (user_id, attempted_at);
create index join_attempts_ip_idx on public.join_attempts (ip, attempted_at);
