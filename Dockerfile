# syntax=docker/dockerfile:1
#
# OneClup — production image (independent of the existing Onlenco deployment).
# Two stages: build the React SPA, then run Django + Gunicorn.
# Build context is the repository root.

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the React/Vite front-end (SPA)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend

WORKDIR /app

# Install deps first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Build the SPA. VITE_* values are baked in at build time.
COPY . .
ARG VITE_PROVIDER_MODE=production
ARG VITE_AGORA_APP_ID=
ENV VITE_PROVIDER_MODE=${VITE_PROVIDER_MODE} \
    VITE_AGORA_APP_ID=${VITE_AGORA_APP_ID}
# build:fast = `vite build` (typecheck runs in CI, not in the release image).
RUN npm run build:fast          # → /app/dist

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Django + Gunicorn runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings \
    APP_HOME=/app

WORKDIR ${APP_HOME}

# Runtime + build deps for psycopg2; netcat for the DB wait; curl for healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Python deps first (cache layer).
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Django project.
COPY backend/ ./

# Deployment helpers.
COPY deploy/entrypoint.sh /entrypoint.sh
COPY deploy/gunicorn.conf.py ./gunicorn.conf.py

# Built SPA from stage 1 (published to the shared volume by the entrypoint).
COPY --from=frontend /app/dist ./spa_build

# Non-root user + writable dirs.
RUN chmod +x /entrypoint.sh \
    && addgroup --system app \
    && adduser --system --ingroup app --home ${APP_HOME} app \
    && mkdir -p ${APP_HOME}/staticfiles ${APP_HOME}/media ${APP_HOME}/frontend \
    && chown -R app:app ${APP_HOME}

USER app

EXPOSE 8001

# Container-level healthcheck (compose also declares one).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8001/api/v1/health/liveness/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "-c", "gunicorn.conf.py"]
