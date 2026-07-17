# OneClup — Production Deployment (Docker + Nginx)

Deploys **OneClup** (`oneclup.com`, `www.oneclup.com`) on the same VPS as the
existing **Onlenco** app, **without touching Onlenco**.

```
Internet
   │
 Nginx (host, :80/:443, TLS)
   ├── onlenco.academy ──► 127.0.0.1:8000   (existing app — untouched)
   └── oneclup.com     ──► 127.0.0.1:8001   (this Docker app)
```

The container binds **only** `127.0.0.1:8001` — never public. Nginx is the sole
front door. Onlenco keeps its own vhost, port, and SSL.

---

## 0. One-time server prep

```bash
# Docker Engine + Compose plugin (skip if already installed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Deploy directory — MUST match the paths in the Nginx config (/opt/oneclup/app)
sudo mkdir -p /opt/oneclup && sudo chown $USER:$USER /opt/oneclup
# HTTPS clone (no SSH key needed; use a Personal Access Token if the repo is private)
git clone https://github.com/mohammed0115/onclube.git /opt/oneclup/app
cd /opt/oneclup/app

# The container runs as uid 1000; make the mounted dirs writable by it.
mkdir -p staticfiles media frontend_dist
sudo chown -R 1000:1000 staticfiles media frontend_dist

# certbot webroot for ACME
sudo mkdir -p /var/www/certbot
```

## 1. Configure environment

```bash
cp deploy/.env.production.example .env.production
# Edit .env.production — set SECRET_KEY, DB password, AGORA_*, ALLOWED_HOSTS, etc.
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # SECRET_KEY
```

> All compose commands pass `--env-file .env.production` so this single file
> drives both build args and the container runtime. (Alternatively:
> `ln -s .env.production .env`.)

## 2. Build & start

Self-hosted DB + cache (recommended default):

```bash
docker compose --env-file .env.production --profile db --profile cache up -d --build
```

External managed DB (set `USE_EXTERNAL_DB=true` + `DATABASE_URL` first, no `db` profile):

```bash
docker compose --env-file .env.production up -d --build
```

`migrate` + `collectstatic` + SPA publish run automatically in the entrypoint.
To run them by hand:

```bash
docker compose --env-file .env.production exec web python manage.py migrate
docker compose --env-file .env.production exec web python manage.py collectstatic --noinput
docker compose --env-file .env.production exec web python manage.py createsuperuser
```

## 3. Nginx vhost + TLS

```bash
sudo cp deploy/nginx/oneclup.com.conf /etc/nginx/sites-available/oneclup.com
sudo ln -s /etc/nginx/sites-available/oneclup.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issue certificates (fills in the ssl_certificate lines automatically)
sudo certbot --nginx -d oneclup.com -d www.oneclup.com
sudo nginx -t && sudo systemctl reload nginx
```

> DNS: point `oneclup.com` and `www.oneclup.com` A records at `187.127.86.111`
> before running certbot.

---

## Deployment commands (day-to-day)

```bash
cd /opt/oneclup/app
git pull
docker compose --env-file .env.production --profile db --profile cache up -d --build
docker compose --env-file .env.production logs -f web
docker compose --env-file .env.production exec web python manage.py migrate
docker compose --env-file .env.production exec web python manage.py collectstatic --noinput
```

> Tip: add `alias dc='docker compose --env-file .env.production'` to shorten these.

---

## Verification

```bash
docker ps                                          # containers running
docker compose --env-file .env.production ps        # health = healthy
curl -I http://127.0.0.1:8001/api/v1/health/liveness/   # 200 from the container
docker compose --env-file .env.production logs --tail=100 web
sudo systemctl status nginx
sudo nginx -t
curl -I https://oneclup.com                         # 200/301 via Nginx+TLS
curl -I https://onlenco.academy                     # Onlenco still 200 — unaffected
```

Expected: `oneclup_web` healthy, `curl localhost:8001` returns JSON, Nginx OK,
both domains serve independently.

---

## Rollback

Compose keeps the previous image until you prune, so rollback is fast.

```bash
cd /opt/oneclup/app

# A) Roll code back to the previous commit and rebuild
git log --oneline -n 5
git checkout <previous-good-commit>
docker compose --env-file .env.production up -d --build

# B) Roll back to the previously-built image (no rebuild)
docker images oneclup-web            # find the prior image id/tag
docker tag <old-image-id> oneclup-web:latest
docker compose --env-file .env.production up -d web

# C) Roll back a bad migration (example)
docker compose --env-file .env.production exec web python manage.py migrate <app> <previous_migration>

# D) Full stop (Onlenco is untouched)
docker compose --env-file .env.production down          # keeps volumes/data
# docker compose --env-file .env.production down -v      # DANGER: also drops DB volume
```

Database backup/restore (bundled Postgres):

```bash
# Backup
docker compose --env-file .env.production exec -T postgres \
  pg_dump -U oneclup oneclup > backup_$(date +%F).sql
# Restore
cat backup_YYYY-MM-DD.sql | docker compose --env-file .env.production exec -T postgres \
  psql -U oneclup -d oneclup
```

---

## Troubleshooting

### 502 Bad Gateway
- Container up? `docker compose ps` → `web` should be `healthy`.
- App listening? `curl -I http://127.0.0.1:8001/api/v1/health/liveness/`.
- Nginx upstream matches the port (`127.0.0.1:8001`)? `sudo nginx -t`.
- App logs: `docker compose --env-file .env.production logs --tail=200 web`.
- SELinux/AppArmor blocking loopback proxy? Check `journalctl -u nginx`.

### Container exits immediately
- `docker compose --env-file .env.production logs web` — read the last lines.
- Common causes: bad `SECRET_KEY`/`ALLOWED_HOSTS` (fail-closed in prod),
  `DATABASE_URL` unreachable, a failing migration.
- Run interactively: `docker compose --env-file .env.production run --rm web sh`
  then `python manage.py check` / `python manage.py migrate`.

### Static files missing (unstyled admin / 404 assets)
- `docker compose --env-file .env.production exec web python manage.py collectstatic --noinput`.
- Confirm the bind mount is populated on the host: `ls /opt/oneclup/app/staticfiles`.
- Nginx `alias` path must match `DEPLOY_DIR` (`/opt/oneclup/app/staticfiles/`).
- SPA blank page → `ls /opt/oneclup/app/frontend_dist` (entrypoint copies it there);
  `location /` root must point at it.

### Database connection failed
- Using the bundled DB? `docker compose ps postgres` → healthy; started with `--profile db`.
- `DATABASE_URL` host must be `postgres` (the service name), not `localhost`.
- Password mismatch between `POSTGRES_PASSWORD` and `DATABASE_URL`.
- External DB: `USE_EXTERNAL_DB=true` and the VPS can reach the DB host/port
  (`nc -z <host> 5432`).

### Permission denied
- The container runs as **uid 1000**; bind-mounted host dirs created by Docker are
  root-owned, so collectstatic / SPA-copy fail. Fix:
  `sudo chown -R 1000:1000 /opt/oneclup/app/{staticfiles,media,frontend_dist}`
  then `docker compose --env-file .env.production up -d`.
- `entrypoint.sh not executable` → it's `chmod +x`'d in the image; if you edited
  it on the host, `git update-index --chmod=+x deploy/entrypoint.sh`.

### Gunicorn failed
- Read `docker logs oneclup_web`.
- `ModuleNotFoundError` → dependency missing from `requirements.txt`; rebuild.
- Worker timeouts on cold start → raise `GUNICORN_TIMEOUT` in `.env.production`.
- Wrong app path → must be `config.wsgi:application` (it is, in the Dockerfile CMD).

### Nginx proxy failed
- `sudo nginx -t` for syntax; `sudo journalctl -u nginx -n 100`.
- Duplicate `map`/`upstream` name with Onlenco → this config uses
  `oneclup_conn_upgrade` / `oneclup_backend` to avoid that.
- Cert paths missing → run certbot (step 3); until then the `:443` block won't load.
- Confirm `X-Forwarded-Proto $scheme` is set (already in this config) or Django
  will 301-loop / reject CSRF.

---

## What was added to the Django app (this deployment)

- `STATIC_ROOT`, `MEDIA_URL`, `MEDIA_ROOT` (collectstatic targets)
- `CSRF_TRUSTED_ORIGINS` (env-driven)
- WhiteNoise middleware + compressed-manifest storage (prod only)
- `gunicorn`, `whitenoise`, `redis` in `requirements.txt`

`SECURE_PROXY_SSL_HEADER`, HSTS, secure cookies and SSL-redirect were already
enabled automatically whenever `DEBUG=False` (see `backend/config/security.py`).
None of this affects Onlenco — it is a separate process, port, and vhost.
