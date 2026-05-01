#!/usr/bin/env bash
# Applies schema.sql to the Postgres database referenced by POSTGRES_URL.
# Idempotent: every statement uses CREATE TABLE/INDEX IF NOT EXISTS,
# so re-running on an existing database is safe.
#
# Usage:
#   POSTGRES_URL=postgres://... ./scripts/apply-schema.sh
# or
#   ./scripts/apply-schema.sh   # auto-loads .env.local if present
#
# Tip: `vercel env pull .env.local` populates POSTGRES_URL from your
# linked Vercel project so this script can run unattended.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
    echo "Loading .env.local…"
    set -a
    # shellcheck disable=SC1091
    . ./.env.local
    set +a
fi

if [ -z "${POSTGRES_URL:-}" ]; then
    echo "ERROR: POSTGRES_URL is not set." >&2
    echo "Set it in your shell or in .env.local. To pull it from Vercel:" >&2
    echo "  npx vercel link        # link this directory to your Vercel project" >&2
    echo "  npx vercel env pull .env.local" >&2
    exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: psql is not installed. Install postgresql-client (apt) or postgresql (brew)." >&2
    exit 1
fi

echo "Applying schema.sql…"
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f schema.sql

echo
echo "Tables now in database:"
psql "$POSTGRES_URL" -c "\dt"

echo
echo "Done."
