-- Lock the API surface. Clients (roles anon / authenticated) get:
--   * SELECT on the tables that have a select policy (RLS decides which rows), and nothing else on tables;
--   * EXECUTE on the public RPCs listed here, and nothing else.
-- Signed-in guests use role `authenticated` (Supabase anonymous auth); `anon` is the not-signed-in role and
-- gets nothing. Rule for future migrations: every new function needs an explicit GRANT below it.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- new objects created by later migrations start locked as well
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant select on
  public.profiles, public.groups, public.group_members, public.join_codes, public.experiences,
  public.saves, public.picks, public.pick_options, public.votes, public.option_tallies,
  public.pick_voter_status, public.plans, public.plan_revisions, public.rsvps, public.plan_links,
  public.submissions, public.listing_reports
to authenticated;
-- join_attempts: no client access at all

grant execute on function
  public.set_profile(text, text),
  public.create_group(text),
  public.preview_group_code(text),
  public.join_group(text),
  public.create_pick(uuid, jsonb, timestamptz, integer),
  public.add_option(uuid, uuid, timestamptz),
  public.cast_vote(uuid, text),
  public.close_pick(uuid),
  public.cancel_pick(uuid),
  public.override_pick(uuid, uuid),
  public.send_plan(uuid, uuid, uuid, timestamp, timestamp, text, text, uuid[], uuid, text),
  public.respond(uuid, integer, text),
  public.edit_plan(uuid, jsonb)
to authenticated;
-- close_due_picks(): pg_cron / service_role only (no grant)

grant execute on all functions in schema private to authenticated, service_role;
