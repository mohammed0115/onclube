"""
Upload validation for payment-receipt files.

Enforced at the API input boundary (the DRF serializer) so an invalid or
malicious file never reaches the storage gateway or the use case:

  * allowed types only: jpg / jpeg / png / pdf
  * a maximum size (configurable via ``RECEIPT_MAX_UPLOAD_BYTES``)
  * empty files rejected
  * the declared content-type must be allowed
  * the file's magic bytes must match an allowed type (defends against a
    spoofed extension / content-type)
  * the stored filename is sanitised (no path traversal, safe charset)
"""
import os
import re

from django.conf import settings
from rest_framework import serializers

DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

ALLOWED_RECEIPT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
ALLOWED_RECEIPT_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}

# Leading magic bytes → canonical content type.
_MAGIC_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"%PDF-", "application/pdf"),
)


def max_upload_bytes() -> int:
    return int(getattr(settings, "RECEIPT_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES))


def sanitize_filename(name: str) -> str:
    """Return a safe basename: no directory components, no traversal, safe charset."""
    base = os.path.basename(name or "")          # drop any path / "../" segments
    base = base.replace("\x00", "")               # strip NUL bytes
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)  # collapse anything unusual
    base = base.lstrip(".")                        # no leading dots / hidden files
    return base[:120] or "receipt"


def _sniff_content_type(header: bytes):
    for signature, content_type in _MAGIC_SIGNATURES:
        if header.startswith(signature):
            return content_type
    return None


def validate_receipt_file(value):
    """
    Validate an uploaded receipt file and return it with a sanitised ``name``.
    Raises ``serializers.ValidationError`` on any violation.
    """
    size = getattr(value, "size", None)
    if not size:
        raise serializers.ValidationError("The uploaded file is empty.")
    limit = max_upload_bytes()
    if size > limit:
        raise serializers.ValidationError(
            f"File is too large (maximum {limit // (1024 * 1024)} MB)."
        )

    ext = os.path.splitext(value.name or "")[1].lower()
    if ext not in ALLOWED_RECEIPT_EXTENSIONS:
        raise serializers.ValidationError(
            "Unsupported file type. Allowed types: jpg, png, pdf."
        )

    declared = getattr(value, "content_type", None)
    if declared and declared not in ALLOWED_RECEIPT_CONTENT_TYPES:
        raise serializers.ValidationError(
            "Unsupported content type. Allowed types: jpg, png, pdf."
        )

    header = value.read(8)
    value.seek(0)  # rewind so the view can read the full body afterwards
    if _sniff_content_type(header) is None:
        raise serializers.ValidationError(
            "File content does not match an allowed type (jpg, png, pdf)."
        )

    value.name = sanitize_filename(value.name)
    return value
