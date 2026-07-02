"""
Payment-receipt upload validation tests.

Unit-level coverage of `api.upload` (type / size / empty / magic-byte / filename)
plus API-level coverage that invalid uploads are rejected with the standard
{code, detail} error envelope and a valid upload still succeeds.
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import serializers
from rest_framework.test import APIClient

from api.upload import (
    DEFAULT_MAX_UPLOAD_BYTES,
    sanitize_filename,
    validate_receipt_file,
)
from apps.common.factories import make_plan, make_student

pytestmark = pytest.mark.django_db

# Minimal valid magic-byte payloads for each allowed type.
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00 hello"
PNG = b"\x89PNG\r\n\x1a\n" + b"rest-of-png"
PDF = b"%PDF-1.4\n stuff"


def _upload(name, content, content_type):
    return SimpleUploadedFile(name, content, content_type=content_type)


# ── unit: sanitize_filename ───────────────────────────────────────────────────
def test_sanitize_filename_strips_path_traversal():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("/abs/path/receipt.jpg") == "receipt.jpg"
    assert sanitize_filename("a b;rm -rf.png") == "a_b_rm_-rf.png"
    assert sanitize_filename("") == "receipt"
    assert sanitize_filename("...") == "receipt"


# ── unit: validate_receipt_file ───────────────────────────────────────────────
@pytest.mark.parametrize(
    "name,content,ctype",
    [
        ("receipt.jpg", JPEG, "image/jpeg"),
        ("receipt.jpeg", JPEG, "image/jpeg"),
        ("receipt.png", PNG, "image/png"),
        ("receipt.pdf", PDF, "application/pdf"),
    ],
)
def test_valid_files_pass(name, content, ctype):
    value = validate_receipt_file(_upload(name, content, ctype))
    # Body is left readable for the view.
    assert value.read() == content


def test_empty_file_rejected():
    with pytest.raises(serializers.ValidationError):
        validate_receipt_file(_upload("receipt.jpg", b"", "image/jpeg"))


def test_oversized_file_rejected():
    big = JPEG + b"\x00" * (DEFAULT_MAX_UPLOAD_BYTES + 1)
    with pytest.raises(serializers.ValidationError):
        validate_receipt_file(_upload("receipt.jpg", big, "image/jpeg"))


def test_disallowed_extension_rejected():
    with pytest.raises(serializers.ValidationError):
        validate_receipt_file(_upload("receipt.exe", JPEG, "image/jpeg"))


def test_disallowed_content_type_rejected():
    with pytest.raises(serializers.ValidationError):
        validate_receipt_file(_upload("receipt.jpg", JPEG, "application/x-msdownload"))


def test_magic_bytes_mismatch_rejected():
    # Correct extension + content-type, but the bytes are not a real image/pdf.
    with pytest.raises(serializers.ValidationError):
        validate_receipt_file(_upload("receipt.pdf", b"not a real pdf", "application/pdf"))


def test_extension_spoof_rejected():
    # An executable renamed to .png with a spoofed content-type is caught by magic bytes.
    with pytest.raises(serializers.ValidationError):
        validate_receipt_file(_upload("evil.png", b"MZ\x90\x00 executable", "image/png"))


def test_filename_is_sanitized_in_place():
    value = validate_receipt_file(_upload("../../../evil name.jpg", JPEG, "image/jpeg"))
    assert value.name == "evil_name.jpg"


# ── API level ─────────────────────────────────────────────────────────────────
def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _submit(client, plan, receipt, txn="TRX-UP-1"):
    return client.post(
        "/api/v1/billing/payment-proof/",
        {
            "planId": str(plan.id),
            "transactionNumber": txn,
            "transferDatetime": timezone.now().isoformat(),
            "amount": "220.00",
            "receipt": receipt,
        },
        format="multipart",
    )


def test_api_valid_upload_succeeds():
    student = make_student()
    plan = make_plan()
    resp = _submit(_client(student.user), plan, _upload("receipt.png", PNG, "image/png"))
    assert resp.status_code == 201
    assert resp.data["status"] == "pending_review"


@pytest.mark.parametrize(
    "name,content,ctype",
    [
        ("receipt.exe", JPEG, "image/jpeg"),        # bad extension
        ("receipt.jpg", b"", "image/jpeg"),          # empty
        ("receipt.pdf", b"not a pdf", "application/pdf"),  # magic mismatch
        ("evil.png", b"MZ executable", "image/png"),  # spoofed
    ],
)
def test_api_invalid_upload_rejected_with_standard_envelope(name, content, ctype):
    student = make_student()
    plan = make_plan()
    resp = _submit(_client(student.user), plan, _upload(name, content, ctype))
    assert resp.status_code == 400
    # Standard {code, detail} envelope — no stack trace, no server error.
    assert resp.data["code"] == "validation_error"
    assert "detail" in resp.data
