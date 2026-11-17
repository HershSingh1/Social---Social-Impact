-- TEC-115 (P0-02 backend, decision N6): interests from onboarding Figma 1.4 "What are you into?".
-- Private to the person: not shared with groups, not in get_profile_cards, never logged.
begin;

-- The chips on Figma 1.4, in screen order. Adding a chip means a new migration that replaces this function.
create function private.interest_categories() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'brunch', 'coffee', 'food_trucks', 'cocktails', 'dessert',
    'concerts', 'comedy', 'theater', 'live_jazz',
    'hiking', 'climbing', 'pickup_sports', 'kayaking',
    'museums', 'markets', 'film', 'workshops'
  ]
$$;
revoke all on function private.interest_categories() from public, anon, authenticated;

create table public.interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category = any (private.interest_categories())),
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  primary key (user_id, category)
);

alter table public.interests enable row level security;
revoke all on table public.interests from public, anon, authenticated;
grant select on table public.interests to authenticated;

create policy own_interests on public.interests for select to authenticated
  using (user_id = (select auth.uid()));

-- answers is an object such as {"brunch": "yes", "film": "maybe"} and replaces every row the caller has.
-- '{}' clears them. A retry sends the same object and ends in the same rows, so there is no client_key.
create function public.set_interests(answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_profile();
begin
  if answers is null or jsonb_typeof(answers) <> 'object' then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(answers) k where k <> all (private.interest_categories())
  ) then
    raise exception 'unknown_category' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(answers) e
      where jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' not in ('yes', 'maybe', 'no')
  ) then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;

  delete from public.interests where user_id = uid;
  insert into public.interests (user_id, category, answer)
    select uid, e.key, e.value #>> '{}' from jsonb_each(answers) e;
end $$;
revoke all on function public.set_interests(jsonb) from public, anon;
grant execute on function public.set_interests(jsonb) to authenticated;

commit;
