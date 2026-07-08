"""
Operational health endpoints (Sprint 11) — thin views only.

/health/liveness/  → the process answers.
/health/readiness/ → critical dependencies (database, cache) are usable.
/health/providers/ → which live-session adapter each port resolves to (no secrets).

These are operational, unauthenticated, and gated by settings.HEALTHCHECK_ENABLED.
All logic lives in infrastructure.observability.health — the views only translate.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from infrastructure.observability import health


def _enabled() -> bool:
    return getattr(settings, "HEALTHCHECK_ENABLED", True)


class _HealthView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]


class LivenessView(_HealthView):
    def get(self, request):
        if not _enabled():
            return Response({"status": "disabled"}, status=status.HTTP_404_NOT_FOUND)
        return Response(health.liveness())


class ReadinessView(_HealthView):
    def get(self, request):
        if not _enabled():
            return Response({"status": "disabled"}, status=status.HTTP_404_NOT_FOUND)
        result = health.readiness()
        http = status.HTTP_200_OK if result["status"] == "ready" else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(result, status=http)


class ProvidersHealthView(_HealthView):
    def get(self, request):
        if not _enabled():
            return Response({"status": "disabled"}, status=status.HTTP_404_NOT_FOUND)
        return Response(health.providers())
