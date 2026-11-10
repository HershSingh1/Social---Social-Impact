#!/usr/bin/env bash
# Loads supabase/seed.sql on a fresh local database and checks the catalog rules from the spec (P0-05, P0-06).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOAD_SEED=1 "$ROOT/scripts/local-db/run-tests.sh" "zz*" >/dev/null
Q() { psql -X -q -At -d sidequest_test -c "$1"; }
fail=0
check() { # check "<description>" "<sql returning t/f>"
  if [ "$(Q "$2")" = t ]; then echo "ok   - $1"; else echo "FAIL - $1"; fail=1; fi
}
check "at least 40 experiences"                         "select count(*) >= 40 from public.experiences"
check "all seven categories, at least 5 each"           "select count(*) = 7 and min(n) >= 5 from (select category, count(*) n from public.experiences group by 1) s"
check "every source is marked PLACEHOLDER"              "select bool_and(source like 'PLACEHOLDER:%') from public.experiences"
check "every row has a checked-on date"                 "select bool_and(checked_on is not null) from public.experiences"
check "all four price kinds are covered"                "select count(distinct price_kind) = 4 from public.experiences"
check "all three timing kinds are covered"              "select count(distinct timing_kind) = 3 from public.experiences"
check "booking-required rows have a provider link"      "select bool_and(booking_url is not null) from public.experiences where booking_required"
check "fixed rows have labelled sessions"               "select bool_and(sessions -> 0 ->> 'label' is not null) from public.experiences where timing_kind = 'fixed'"
check "flexible rows have hours text"                   "select bool_and(hours_text is not null) from public.experiences where timing_kind = 'flexible'"
check "some prices are above \$25 and some above \$50"  "select bool_or(price_max > 25) and bool_or(price_max > 50) from public.experiences"
check "coordinates are inside the Austin area"          "select bool_and(lat between 30.0 and 30.6 and lng between -98.1 and -97.4) from public.experiences"
check "names are unique"                                "select count(*) = count(distinct name) from public.experiences"
psql -X -q -d sidequest_test -f "$ROOT/supabase/seed.sql"
check "seed is idempotent (still the same row count)"   "select count(*) = 42 from public.experiences"
exit $fail
