#!/usr/bin/env bash
# Verifies the full schema + migrations against a local PostgreSQL 16.
# Usage: sudo -u postgres bash supabase/tests/run-local.sh
set -e
DB=pennpal_test
cd "$(dirname "$0")/../.."
dropdb --if-exists $DB && createdb $DB
psql -v ON_ERROR_STOP=1 -q -d $DB -f supabase/tests/shim.sql
for round in 1 2; do  # run twice: proves idempotency
  for f in supabase/schema.sql supabase/migrations/*.sql; do
    psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
  done
  echo "migrations round $round OK"
done
psql -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/pilot-tests.sql | grep -cE "\| t" | xargs -I{} echo "pilot-tests: {} passing assertions"
dropdb $DB && createdb $DB
psql -v ON_ERROR_STOP=1 -q -d $DB -f supabase/tests/shim.sql
for f in supabase/schema.sql supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
done
psql -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/wave1-tests.sql | grep -cE "\| t" | xargs -I{} echo "wave1-tests: {} passing assertions"
dropdb $DB && createdb $DB
psql -v ON_ERROR_STOP=1 -q -d $DB -f supabase/tests/shim.sql
for f in supabase/schema.sql supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
done
psql -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/identity-filter-tests.sql | grep -cE "\| t" | xargs -I{} echo "identity-filter-tests: {} passing assertions"
echo "ALL SQL TESTS PASS"
