#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# OneClup — production deploy / update script
#
# Run this ON THE SERVER, from the repo root (the folder that has docker-compose.yml
# and .env.production). It:
#   1) pulls the latest main
#   2) makes sure TIME_ZONE is set (defaults to Africa/Khartoum)
#   3) rebuilds the image and restarts the stack
#   4) applies DB migrations (the entrypoint also does this; we run it explicitly
#      so the deploy fails loudly if a migration errors)
#   5) shows the scheduling migration state and runs a health check
#
# Usage:
#   ./deploy/deploy.sh                 # external managed DB (no bundled services)
#   PROFILES="db cache" ./deploy/deploy.sh   # self-hosted Postgres + Redis
#
# Safe to re-run: migrations and collectstatic are idempotent.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# --- config -----------------------------------------------------------------
BRANCH="${BRANCH:-main}"
ENV_FILE="${ENV_FILE:-.env.production}"
TIME_ZONE_VALUE="${TIME_ZONE_VALUE:-Africa/Khartoum}"
WEB_SERVICE="oneclup"

# docker compose profile flags (e.g. PROFILES="db cache" for the bundled DB/cache)
PROFILE_ARGS=()
for p in ${PROFILES:-}; do PROFILE_ARGS+=(--profile "$p"); done

# Prefer the v2 plugin (`docker compose`); fall back to the legacy binary.
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
else
  DC=(docker-compose)
fi

log() { printf '\n\033[1;36m[deploy]\033[0m %s\n' "$*"; }

# --- sanity checks ----------------------------------------------------------
[ -f docker-compose.yml ] || { echo "Run this from the repo root (no docker-compose.yml here)."; exit 1; }
[ -f "$ENV_FILE" ]        || { echo "Missing $ENV_FILE — create it before deploying."; exit 1; }

# --- 1. pull latest ---------------------------------------------------------
log "Fetching latest $BRANCH ..."
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
log "Now at: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# --- 2. ensure TIME_ZONE is set --------------------------------------------
if grep -q '^TIME_ZONE=' "$ENV_FILE"; then
  log "TIME_ZONE already set in $ENV_FILE ($(grep '^TIME_ZONE=' "$ENV_FILE"))."
else
  log "Adding TIME_ZONE=$TIME_ZONE_VALUE to $ENV_FILE"
  printf '\nTIME_ZONE=%s\n' "$TIME_ZONE_VALUE" >> "$ENV_FILE"
fi

# --- 3. rebuild + restart ---------------------------------------------------
log "Building image and starting the stack ..."
"${DC[@]}" "${PROFILE_ARGS[@]}" up -d --build

log "Waiting for the web container to become healthy ..."
for i in $(seq 1 30); do
  status="$("${DC[@]}" ps --format '{{.Service}} {{.Health}}' 2>/dev/null | awk -v s="$WEB_SERVICE" '$1==s{print $2}')"
  [ "${status:-}" = "healthy" ] && { log "web is healthy."; break; }
  sleep 3
done

# --- 4. apply migrations explicitly (idempotent) ---------------------------
log "Applying database migrations ..."
"${DC[@]}" exec -T "$WEB_SERVICE" python manage.py migrate --noinput

# --- 5. verify --------------------------------------------------------------
log "Scheduling migration state (expect 0011 & 0012 applied):"
"${DC[@]}" exec -T "$WEB_SERVICE" python manage.py showmigrations scheduling | tail -n 15

log "Health check:"
"${DC[@]}" exec -T "$WEB_SERVICE" \
  sh -c 'curl -fsS http://127.0.0.1:8001/api/v1/health/liveness/ && echo' || {
    echo "Health check failed — inspect logs: ${DC[*]} logs --tail=100 $WEB_SERVICE"; exit 1; }

log "Done. New group-session default is 10 (existing singleton bumped from 1 by migration 0012)."
log "Times are now interpreted in $TIME_ZONE_VALUE. Admin can change group size on the Platform page."
