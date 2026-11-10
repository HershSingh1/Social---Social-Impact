#!/usr/bin/env bash
# Run supabase/migrations + supabase/tests on the local Postgres (no Docker needed).
# Usage: [LOAD_SEED=1] scripts/local-db/run-tests.sh [test-file-glob]   e.g. "02_*"
#   LOAD_SEED=1 loads supabase/seed.sql first, like `supabase db reset` does (tests must pass either way).
# On a machine with Docker use `npm run db:test` instead (real Supabase stack + real pgTAP).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB=sidequest_test
FILTER="${1:-*}"

if ! pg_lsclusters | grep -q online; then pg_ctlcluster 16 main start; sleep 3; fi
if [ "$(id -u)" = 0 ]; then
  su postgres -c "psql -tAc \"select 1 from pg_roles where rolname='root'\"" | grep -q 1 || su postgres -c "createuser -s root"
fi
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -X -q -d "$DB" -c "alter database $DB set search_path = public, extensions"

# pgTAP: use the real extension when installed, otherwise the bundled shim.
if ! psql -X -tA -d "$DB" -c "select 1 from pg_available_extensions where name='pgtap' and comment not like '%shim%'" | grep -q 1; then
  SHARE="$(pg_config --sharedir)/extension"
  install -m 644 "$ROOT/scripts/local-db/pgtap-shim/pgtap.control" "$SHARE/pgtap.control"
  sed 's/@extschema@/extensions/' "$ROOT/scripts/local-db/pgtap-shim/pgtap--1.0.sql" > "$SHARE/pgtap--1.0.sql"
fi

"${PSQL[@]}" -f "$ROOT/scripts/local-db/stub-supabase.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

if [ "${LOAD_SEED:-0}" = 1 ]; then echo "seed: supabase/seed.sql"; "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"; fi

fail=0
for f in $(ls "$ROOT"/supabase/tests/$FILTER.test.sql 2>/dev/null | sort); do
  echo "== $(basename "$f")"
  out="$("${PSQL[@]}" -At -f "$f" 2>&1)" || { echo "$out"; echo "ERROR: $(basename "$f") aborted"; fail=1; continue; }
  echo "$out" | grep -E '^(not ok|#|ok)' | grep -vE '^ok' || true
  echo "  $(echo "$out" | grep -c '^ok') passed, $(echo "$out" | grep -c '^not ok') failed"
  if echo "$out" | grep -q '^not ok'; then fail=1; fi
done
exit $fail
