"""
Root URL configuration.

Phase 5 scope: Django Admin + JWT token endpoints only. Full REST APIs for the
domain are intentionally NOT wired up in this phase.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.urls")),
]
