#!/usr/bin/env bash
# Database tests: applies every migration to a throwaway database on a LOCAL
# Postgres, then runs supabase/db-tests/*.test.sql against it. Everything runs
# twice: with Supabase's default grants for new tables and without them
# (the project's "expose new tables" setting), see bootstrap.sql.
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
unset PGDATABASE

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

run_psql() { psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"; }

db=""
cleanup() {
  [[ -z "$db" ]] || run_psql -d postgres -c "drop database if exists \"$db\" with (force)"
  [[ -z "$types_out" ]] || rm -f "$types_out.tmp"
}
trap cleanup EXIT

run_suite() {
  local auto_expose="$1"
  echo "== auto_expose=$auto_expose"

  db="mm_dbtest_$(date +%s)_$$"
  run_psql -d postgres -c "create database \"$db\""

  run_psql -d "$db" -v auto_expose="$auto_expose" -f supabase/db-tests/bootstrap.sql

  local migration
  for migration in supabase/migrations/*.sql; do
    echo "migrate  $migration"
    # One transaction per file, like `supabase db push`.
    run_psql -d "$db" --single-transaction -f "$migration"
  done

  if [[ -n "$types_out" && "$auto_expose" == true ]]; then
    echo "types    $types_out"
    npx --no-install supabase gen types typescript --schema public \
      --db-url "postgresql://$PGUSER:${PGPASSWORD:-}@$PGHOST:$PGPORT/$db" >"$types_out.tmp"
    mv "$types_out.tmp" "$types_out"
  fi

  run_psql -d "$db" -f supabase/db-tests/helpers.sql

  local test
  for test in supabase/db-tests/*.test.sql; do
    echo "test     $test"
    # Query results are noise; failures still reach stderr.
    run_psql -d "$db" --output=/dev/null -f "$test"
  done

  run_psql -d postgres -c "drop database \"$db\" with (force)"
  db=""
}

run_suite true
run_suite false

echo "db-tests: all passed"
