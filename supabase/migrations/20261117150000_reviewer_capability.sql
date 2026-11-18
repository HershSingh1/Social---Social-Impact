-- TEC-100: the app may reveal the review queue only to a reviewer. The private helper remains the source of truth.
begin;
create function public.can_review_listings() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_reviewer()
$$;
revoke all on function public.can_review_listings() from public, anon;
grant execute on function public.can_review_listings() to authenticated;
commit;
