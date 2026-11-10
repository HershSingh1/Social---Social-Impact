# Core schema (TEC-3)

No hosted migration has been applied. Noah approved C1, G1, G4, G5, G7 and G9 on
Nov 10, 2026; `spec-decisions.md` and the data contract record that approval.

The migration adds 14 P0 tables with RLS and no client write grants. Votes are
self-only; totals and completion status are separate. Plans, revisions and RSVPs
use invitation/organizer access independently of membership. Removed invitations
lose access; leaving a group preserves existing plan access. Private policy helpers
avoid recursive membership/RSVP policies. Profiles are self-only because they hold
private preferences; future roster/profile RPCs must project only public name/avatar
fields. `client_key` on groups and picks follows the repository's create-write rule.

Feature RPCs (including transactional tally/status maintenance, join attempt limits,
membership caps and lifecycle validation) remain out of scope. Rate limiting stores
per-user counters, never raw codes. P1/P2 fields and tables are not implemented.

## Run checks

```sh
cd supabase/tests
npm ci
npm test
```

The portable test runner uses PGlite PostgreSQL with real pgTAP, minimal `auth.users`
and `auth.uid()` stand-ins, and Supabase-like initial client grants. It applies the
unchanged migration and runs the same SQL suite used by `supabase test db`.
It verifies table publication membership, not live Realtime delivery or hosted Auth.
After TEC-1 setup, also run the suite against a disposable Supabase project before
pushing to shared development. Review `supabase db push --dry-run` first.
Never reset the shared hosted database to run tests.
