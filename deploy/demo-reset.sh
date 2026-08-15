#!/usr/bin/env bash
# Reset the public demo (demo.franciswebagency.com) back to the seed.
#
# Runs nightly from the deploy user's crontab (see CLAUDE.md → "The public
# demo"). Touches ONLY the fwa_ops_demo database and the api-demo container —
# the real app's data is a different schema in the same mysql container and is
# never referenced here.
#
#   /opt/fwa-ops/deploy/demo-reset.sh
#
# Safe to run by hand at any time; the demo is expected to be wiped.
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/fwa-ops}"
ENV_FILE="${ENV_FILE:-$STACK_DIR/.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" --profile demo)

cd "$STACK_DIR"

# Read just the keys we need. Deliberately NOT `source`d: .env.production holds
# values with spaces and angle brackets (a From identity, say), which the shell
# would try to execute or redirect.
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//'; }

DB_ROOT_PASSWORD="$(env_get DB_ROOT_PASSWORD)"
DEMO_USER_EMAIL="$(env_get DEMO_USER_EMAIL)"
DEMO_USER_NAME="$(env_get DEMO_USER_NAME)"
: "${DEMO_USER_EMAIL:=demo@franciswebagency.com}"
: "${DEMO_USER_NAME:=Alex Rivera}"

if [ -z "$DB_ROOT_PASSWORD" ]; then
  echo "[demo-reset] DB_ROOT_PASSWORD missing from $ENV_FILE — refusing to run" >&2
  exit 1
fi
# The demo account is passwordless in practice (POST /api/auth/demo-login), but
# users.password_hash is NOT NULL — so it gets a random one nobody ever learns.
DEMO_USER_PASSWORD="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"

log() { echo "[demo-reset] $(date -u '+%Y-%m-%d %H:%M:%SZ') $*"; }

log "dropping and recreating fwa_ops_demo"
"${COMPOSE[@]}" exec -T mysql \
  mysql -uroot -p"$DB_ROOT_PASSWORD" \
  -e "DROP DATABASE IF EXISTS fwa_ops_demo; CREATE DATABASE fwa_ops_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

log "applying schema"
"${COMPOSE[@]}" exec -T api-demo npm run migrate

log "seeding sample data"
"${COMPOSE[@]}" exec -T api-demo npm run seed -- --force

log "provisioning the demo account ($DEMO_USER_EMAIL)"
# --silent: npm's run banner echoes the full argv, which would put the generated
# password in this job's log. Throwaway or not, credentials don't belong there.
"${COMPOSE[@]}" exec -T api-demo npm run --silent create-user -- \
  --email "$DEMO_USER_EMAIL" --name "$DEMO_USER_NAME" --password "$DEMO_USER_PASSWORD"

# The API pools connections to a database that was just dropped, so its live
# handles are dead — restart it rather than serving errors until they recycle.
log "restarting api-demo"
"${COMPOSE[@]}" restart api-demo

log "done"
