# OneClup ↔ Onlenco (shared Caddy) — integration

Onlenco already runs **Caddy** (auto-TLS) as the only thing bound to ports 80/443.
A host has just one :443, so OneClup does **not** run its own TLS/Caddy — it plugs
into Onlenco's Caddy as a second site. Onlenco's app is untouched; we only *add*
a network, three read-only mounts, and one site block to Caddy.

## Port map (no collisions)
| | Onlenco | OneClup |
|---|---|---|
| TLS edge (host) | Caddy **:80 / :443** | — (uses Onlenco's Caddy) |
| gunicorn (loopback) | 127.0.0.1:**8000** | 127.0.0.1:**8001** |
| postgres / redis | internal only | internal only |

## One-time setup

### 1. Shared network (run once on the host)
```bash
docker network create edge
```

### 2. Start OneClup (joins `edge`, publishes only 127.0.0.1:8001)
```bash
cd /opt/oneclup/app
git pull
docker compose --env-file .env.production --profile db --profile cache up -d --build
# populate the dirs Caddy will serve:
docker compose --env-file .env.production exec web python manage.py collectstatic --noinput
```

### 3. Add the OneClup site block to Onlenco's Caddyfile
From the Onlenco project directory on the VPS (append — don't replace):
```bash
cat /opt/oneclup/app/deploy/onlenco-integration/oneclup.caddy >> deploy/Caddyfile
```

### 4. Re-deploy Onlenco's Caddy with the overlay (adds network + mounts)
From the Onlenco project directory:
```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.deploy.yml \
  -f /opt/oneclup/app/deploy/onlenco-integration/caddy.overlay.yml \
  up -d caddy
```

### 5. DNS
```
oneclup.com       A  187.127.86.111
www.oneclup.com   A  187.127.86.111
```
Caddy issues the certificate automatically within ~30s of the first HTTPS hit.

## Verify
```bash
docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}'  # caddy + oneclup_web
curl -I https://oneclup.com          # 200 (Caddy TLS)
curl -I https://onlenco.academy      # still 200 — untouched
docker logs <caddy-container> --tail=50   # cert issuance / any proxy errors
```

## Rollback (removes OneClup from Caddy; Onlenco unaffected)
```bash
# 1. remove the appended block from Onlenco's deploy/Caddyfile (delete the
#    `oneclup.com …{ }` section), then:
cd <onlenco-dir>
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d caddy
# 2. stop OneClup
cd /opt/oneclup/app && docker compose --env-file .env.production down
```

## Troubleshooting
- **502 from Caddy** → is `oneclup_web` on `edge`? `docker network inspect edge`.
  Both `caddy` and `oneclup_web` must be listed.
- **oneclup.com cert fails** → DNS not pointing at the VPS yet, or ports 80/443
  blocked; check `docker logs <caddy>`.
- **SPA loads but /api 502** → the container is down/unhealthy:
  `docker compose --env-file .env.production ps` + `logs web`.
- **/static or /media 404** → the mounts in `caddy.overlay.yml` must match where
  you cloned OneClup (`/opt/oneclup/app`). Re-run collectstatic.
