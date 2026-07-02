"""
Tests for the global API exception handler (`api.exceptions.api_exception_handler`).

Guarantees the standard {code, detail} envelope for EVERY error path, and that
database/unexpected errors never leak a raw message or stack trace to the client.
"""
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError

from apps.common.exceptions import BusinessRuleError
from api.exceptions import api_exception_handler


def test_integrity_error_maps_to_409_conflict_envelope():
    # A DB constraint violation (e.g. the partial-unique on an active booking)
    # that escapes a use case must become a clean 409, not a raw 500.
    exc = IntegrityError("UNIQUE constraint failed: bookings.slot_id")
    resp = api_exception_handler(exc, {})

    assert resp is not None
    assert resp.status_code == 409
    assert resp.data == {
        "code": "conflict",
        "detail": "The request conflicts with the current state of the resource.",
    }
    # The raw DB message must NOT be echoed to the client.
    assert "constraint" not in str(resp.data).lower()
    assert "bookings" not in str(resp.data).lower()


def test_unexpected_exception_maps_to_500_without_leaking_detail():
    exc = ValueError("boom: secret internal detail /path/to/file.py")
    resp = api_exception_handler(exc, {})

    assert resp is not None
    assert resp.status_code == 500
    assert resp.data == {
        "code": "server_error",
        "detail": "An unexpected error occurred.",
    }
    # Nothing from the original exception message may reach the client.
    assert "boom" not in str(resp.data)
    assert "secret" not in str(resp.data)
    assert ".py" not in str(resp.data)


def test_key_error_also_maps_to_500_envelope():
    # Any non-DRF, non-domain exception is covered by the catch-all.
    resp = api_exception_handler(KeyError("missing"), {})
    assert resp is not None
    assert resp.status_code == 500
    assert resp.data["code"] == "server_error"


def test_business_rule_error_still_maps_by_code():
    exc = BusinessRuleError("No credit left.", code="no_sessions_remaining")
    resp = api_exception_handler(exc, {})
    assert resp is not None
    assert resp.status_code == 409  # from CODE_STATUS
    assert resp.data == {"code": "no_sessions_remaining", "detail": "No credit left."}


def test_object_does_not_exist_maps_to_404():
    resp = api_exception_handler(ObjectDoesNotExist("Booking matching query does not exist."), {})
    assert resp is not None
    assert resp.status_code == 404
    assert resp.data["code"] == "not_found"
