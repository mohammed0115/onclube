"""Gunicorn configuration for OneClup (production).

Tunables come from the environment so the same image runs everywhere.
The server listens on 8001 inside the container; Compose maps it to 127.0.0.1:8001
on the host so it is NEVER exposed publicly — Nginx is the only front door.
"""
import multiprocessing
import os

# ── Networking ────────────────────────────────────────────────────────────────
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8001")

# ── Workers ───────────────────────────────────────────────────────────────────
# Default: (2 * CPU) + 1. Override with GUNICORN_WORKERS on small VPSes.
workers = int(os.getenv("GUNICORN_WORKERS", (multiprocessing.cpu_count() * 2) + 1))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")
threads = int(os.getenv("GUNICORN_THREADS", "4"))
worker_tmp_dir = "/dev/shm"  # faster heartbeat than disk

# ── Timeouts / recycling ─────────────────────────────────────────────────────
timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))
# Recycle workers to bound memory growth.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))

# ── Behind Nginx (TLS terminated upstream) ───────────────────────────────────
# Trust the reverse proxy's forwarded headers so request.is_secure() is correct.
forwarded_allow_ips = os.getenv("GUNICORN_FORWARDED_ALLOW_IPS", "*")
proxy_protocol = False

# ── Logging (to stdout/stderr → docker logs) ─────────────────────────────────
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
# Include the real client IP forwarded by Nginx.
access_log_format = '%({x-forwarded-for}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sµs'
