#!/usr/bin/env bash
# Database tests: applies every migration to a throwaway database on a LOCAL
# Postgres, then runs supabase/db-tests/*.test.sql against it.
#
#   bash supabase/db-tests/run.sh                 # tests only (npm run test:db)
#   bash supabase/db-tests/run.sh --types FILE    # also write Supabase TS types
#                                                 # to FILE (npm run gen:types)
#
# Connection comes from the usual libpq variables (PGHOST, PGPORT, PGUSER,
# PGPASSWORD); the user must be able to create databases and roles. Refuses
# any host other than localhost, so it can never touch the Supabase project.
# --types needs Docker: the Supabase CLI runs postgres-meta in a container.
set -euo pipefail

cd "$(dirname "$0")/../.."

types_out=""
if [[ "${1:-}" == "--types" ]]; then
  types_out="${2:?--types needs an output file}"
fi

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"

case "$PGHOST" in
  localhost | 127.0.0.1 | ::1) ;;
  *)
    echo "db-tests: refusing PGHOST=$PGHOST; only a local, disposable Postgres is allowed" >&2
    exit 1
    ;;
esac
if [[ -n "${PGHOSTADDR:-}" || -n "${PGSERVICE:-}" ]]; then
  echo "db-tests: unset PGHOSTADDR/PGSERVICE; they can point localhost elsewhere" >&2
  exit 1
fi

db="mm_dbtest_$(date +%s)_$$"
run_psql() { psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"; }

run_psql -d postgres -c "create database \"$db\""
cleanup() {
  run_psql -d postgres -c "drop database if exists \"$db\" with (force)"
  [[ -z "$types_out" ]] || rm -f "$types_out.tmp"
}
trap cleanup EXIT
export PGDATABASE="$db"

run_psql -f supabase/db-tests/bootstrap.sql

for migration in supabase/migrations/*.sql; do
  echo "migrate  $migration"
  # One transaction per file, like `supabase db push`.
  run_psql --single-transaction -f "$migration"
done

if [[ -n "$types_out" ]]; then
  echo "types    $types_out"
  npx --no-install supabase gen types typescript --schema public \
    --db-url "postgresql://$PGUSER:${PGPASSWORD:-}@$PGHOST:$PGPORT/$db" >"$types_out.tmp"
  mv "$types_out.tmp" "$types_out"
fi

run_psql -f supabase/db-tests/helpers.sql

for test in supabase/db-tests/*.test.sql; do
  echo "test     $test"
  # Query results are noise; failures still reach stderr.
  run_psql --output=/dev/null -f "$test"
done

echo "db-tests: all passed"
