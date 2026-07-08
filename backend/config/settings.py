"""
Django settings — OneClub backend (Phase 5 skeleton).

Production database is PostgreSQL (set DATABASE_URL in .env). When DATABASE_URL is
absent the project falls back to a local SQLite file so the test suite and a quick
`runserver` work without a running Postgres — the models use only portable
constructs (UUID PKs, TextChoices, partial UniqueConstraint, CheckConstraint).
"""
from pathlib import Path

import environ

from config.security import (
    resolve_allowed_hosts,
    resolve_secret_key,
    secure_flags,
)

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR / ".env")

# Fail-closed: DEBUG defaults to False, and in production (DEBUG=False) an
# insecure/default SECRET_KEY or a missing/`*` ALLOWED_HOSTS raises at startup
# instead of silently running insecure. See config/security.py.
DEBUG = env.bool("DEBUG", default=False)
SECRET_KEY = resolve_secret_key(env("SECRET_KEY", default=None), debug=DEBUG)
ALLOWED_HOSTS = resolve_allowed_hosts(env.list("ALLOWED_HOSTS", default=[]), debug=DEBUG)

# Max size (bytes) for uploaded payment receipts; overridable per environment.
RECEIPT_MAX_UPLOAD_BYTES = env.int("RECEIPT_MAX_UPLOAD_BYTES", default=5 * 1024 * 1024)

# ── Assessment provider (OpenAI optional; heuristic is the default fallback) ────
# When OPENAI_API_KEY is unset the placement assessment uses the deterministic
# heuristic. No key → no OpenAI calls (tests and local dev are unaffected).
OPENAI_API_KEY = env("OPENAI_API_KEY", default="")
OPENAI_MODEL = env("OPENAI_MODEL", default="gpt-4o-mini")
OPENAI_TIMEOUT_SECONDS = env.int("OPENAI_TIMEOUT_SECONDS", default=20)

# ── Live-session provider selection (Sprint 10) ────────────────────────────────
# Environment-based selection is read ONLY by the composition root (container.py).
# development / testing → stub adapters (no network, no keys).
# staging / production   → real adapters WHEN configured, otherwise stub fallback.
PROVIDER_MODE = env("PROVIDER_MODE", default="development")
# Agora RTC. The APP_ID is public (safe to hand to clients); the APP_CERTIFICATE is
# a SECRET — it is used only to sign tokens server-side and is NEVER serialized.
AGORA_APP_ID = env("AGORA_APP_ID", default="")
AGORA_APP_CERTIFICATE = env("AGORA_APP_CERTIFICATE", default="")
AGORA_TOKEN_TTL_SECONDS = env.int("AGORA_TOKEN_TTL_SECONDS", default=3600)
# Generic provider I/O budget (timeouts / retries) for real adapters.
PROVIDER_TIMEOUT_SECONDS = env.int("PROVIDER_TIMEOUT_SECONDS", default=10)

# ── Observability & monitoring (Sprint 11) ─────────────────────────────────────
LOG_LEVEL = env("LOG_LEVEL", default="INFO")
METRICS_ENABLED = env.bool("METRICS_ENABLED", default=True)
TRACING_ENABLED = env.bool("TRACING_ENABLED", default=True)
HEALTHCHECK_ENABLED = env.bool("HEALTHCHECK_ENABLED", default=True)
# standard | verbose | off — reserved for future sink/verbosity selection.
OBSERVABILITY_MODE = env("OBSERVABILITY_MODE", default="standard")

# Structured logging: the observability + api loggers emit single-line JSON.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {"()": "infrastructure.observability.logging.StructuredFormatter"},
    },
    "handlers": {
        "structured": {"class": "logging.StreamHandler", "formatter": "structured"},
    },
    "loggers": {
        "observability": {"handlers": ["structured"], "level": LOG_LEVEL, "propagate": False},
        "api": {"handlers": ["structured"], "level": "WARNING", "propagate": False},
    },
}

# ── Applications ──────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.onboarding",
    "apps.billing",
    "apps.scheduling",
    "apps.sessions",
    "apps.ai_reports",
    "apps.notifications",
    "apps.admin_ops",
    "apps.placement",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Request correlation + HTTP observability (early, so every log/metric shares ids).
    "infrastructure.observability.middleware.RequestObservabilityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ── Database ──────────────────────────────────────────────────────────────────
# Production: postgres://USER:PASS@HOST:5432/DBNAME  (via DATABASE_URL)
# Fallback:   local sqlite file (dev/test convenience only)
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
    )
}

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── I18N / TZ (timezone-aware everywhere) ────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── DRF / JWT (auth wiring only; full APIs are out of scope this phase) ───────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # All domain → HTTP translation happens here.
    "EXCEPTION_HANDLER": "api.exceptions.api_exception_handler",
}

from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# ── Payment providers (configurable) ──────────────────────────────────────────
# Manual bank-transfer workflow: bank/account details are CONFIGURATION, never
# hardcoded in code or the frontend. A deployment may list several providers in
# this setting; the default provider's fields are env-overridable. Only active
# providers are served, ordered by display_order. Default production provider is
# Bank of Khartoum via the Bankak transfer method (currency SDG).
PAYMENT_PROVIDERS = [
    {
        "provider_key": env("PAYMENT_PROVIDER_KEY", default="bank_of_khartoum"),
        "provider_name": env("PAYMENT_PROVIDER_NAME", default="Bank of Khartoum"),
        "transfer_method": env("PAYMENT_TRANSFER_METHOD", default="Bankak"),
        "bank_name": env("PAYMENT_BANK_NAME", default="Bank of Khartoum"),
        "account_name": env("PAYMENT_ACCOUNT_NAME", default="OneClub Education"),
        "account_number": env("PAYMENT_ACCOUNT_NUMBER", default=""),
        "iban": env("PAYMENT_IBAN", default=""),
        "instructions": env(
            "PAYMENT_INSTRUCTIONS_TEXT",
            default=(
                "Open your Bankak app, transfer the exact amount to the account above, "
                "and use your full name as the transfer reference so we can match it."
            ),
        ),
        "currency": env("PAYMENT_CURRENCY", default="SDG"),
        "is_active": env.bool("PAYMENT_IS_ACTIVE", default=True),
        "display_order": env.int("PAYMENT_DISPLAY_ORDER", default=1),
    },
]

# ── Production security hardening ──────────────────────────────────────────────
# Applied only when DEBUG is False so local dev / the test client keep working
# over plain HTTP. Enables HTTPS redirect, secure cookies, HSTS, and nosniff.
globals().update(secure_flags(debug=DEBUG))
