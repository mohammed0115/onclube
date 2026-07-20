#!/usr/bin/env sh
# OneClup container entrypoint.
# Waits for the DB (when using the bundled Postgres), applies migrations, collects
# static, publishes the built SPA to the Nginx-served volume, then execs the CMD.
set -eu

echo "[entrypoint] starting OneClup ($(date -u +%FT%TZ))"

# ── Wait for Postgres when we manage it ourselves ────────────────────────────
# USE_EXTERNAL_DB=true  → an external managed DB (via DATABASE_URL); skip the wait.
if [ "${USE_EXTERNAL_DB:-false}" != "true" ] && [ -n "${POSTGRES_HOST:-}" ]; then
    echo "[entrypoint] waiting for postgres at ${POSTGRES_HOST}:${POSTGRES_PORT:-5432} ..."
    i=0
    until nc -z "${POSTGRES_HOST}" "${POSTGRES_PORT:-5432}"; do
        i=$((i + 1))
        if [ "$i" -ge 60 ]; then
            echo "[entrypoint] ERROR: postgres not reachable after 60s" >&2
            exit 1
        fi
        sleep 1
    done
    echo "[entrypoint] postgres is up."
fi

# ── Database migrations ───────────────────────────────────────────────────────
echo "[entrypoint] applying migrations ..."
python manage.py migrate --noinput

# ── Optional one-time seed (opt-in) ───────────────────────────────────────────
# Set SEED_ON_START=true on the FIRST deploy to seed baseline data (goals/topics)
# and the founding instructor (with photo). Idempotent, but a re-run re-features
# the founding instructor — so unset it after the first boot.
[ "${SEED_ON_START:-false}" = "true" ] && { echo "[entrypoint] seeding baseline data ..."; python manage.py seed_reference || true; python manage.py seed_founding_instructor || true; }

# ── Static files (Django admin/DRF etc.) ─────────────────────────────────────
echo "[entrypoint] collecting static ..."
python manage.py collectstatic --noinput --clear

# ── Publish the built SPA to the shared (Nginx-served) volume ─────────────────
if [ -d /app/spa_build ]; then
    echo "[entrypoint] publishing SPA to /app/frontend ..."
    mkdir -p /app/frontend
    cp -a /app/spa_build/. /app/frontend/
fi

echo "[entrypoint] handing off to: $*"
exec "$@"
