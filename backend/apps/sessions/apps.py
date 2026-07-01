from django.apps import AppConfig


class SessionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sessions"
    # NOTE: custom label avoids a clash with django.contrib.sessions ("sessions").
    # Cross-app model references therefore use "live_sessions.Session".
    label = "live_sessions"
