"""
Shared abstract base models — audit fields, UUID PKs, soft delete.

`common` is intentionally NOT a registered Django app: it contains only abstract
models, so it creates no tables and needs no migrations. The audit-field spec is
from the approved database design (§5) and the deletion policy (§4).
"""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class UUIDModel(models.Model):
    """Primary key is a server-generated UUID (surfaced to the API as a string)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    """createdAt / updatedAt — timezone-aware (USE_TZ=True)."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditModel(TimeStampedModel):
    """
    Full audit block: createdAt, updatedAt, createdBy, updatedBy.

    `*_by` are nullable because rows can originate from the actor themselves
    (self-signup) or from system jobs (the expiry sweep) where no acting user
    is recorded.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        abstract = True


class SoftDeleteModel(models.Model):
    """
    Adds a nullable `deleted_at`. Per the deletion policy, soft-deletable rows set
    this instead of being removed. (Default managers are left unfiltered in this
    skeleton; filtering is an application concern wired up in a later phase.)
    """

    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self, using=None):
        self.deleted_at = timezone.now()
        self.save(using=using, update_fields=["deleted_at"])


class BaseModel(UUIDModel, AuditModel):
    """UUID PK + full audit block — the default for core business tables."""

    class Meta:
        abstract = True
