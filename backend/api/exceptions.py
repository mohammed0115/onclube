"""
Global DRF exception handler.

Maps domain exceptions (BusinessRuleError + subclasses) to HTTP responses by
their `.code`, and normalizes repository `Model.DoesNotExist` to 404. All API
error bodies share the shape: {"code": <str>, "detail": <str>}.

This is the ONLY place domain → HTTP translation happens, so views never catch
domain exceptions themselves.
"""
import logging

from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("api")

from apps.common.exceptions import BusinessRuleError

# Domain `.code` → HTTP status. Anything unmapped falls back to 422.
CODE_STATUS = {
    "permission_denied": http_status.HTTP_403_FORBIDDEN,
    "invalid_state": http_status.HTTP_409_CONFLICT,
    "no_active_subscription": http_status.HTTP_403_FORBIDDEN,
    "subscription_already_active": http_status.HTTP_409_CONFLICT,
    "subscription_expired": http_status.HTTP_409_CONFLICT,
    "no_sessions_remaining": http_status.HTTP_409_CONFLICT,
    "slot_unavailable": http_status.HTTP_409_CONFLICT,
    "slot_instructor_mismatch": http_status.HTTP_409_CONFLICT,
    "cancellation_window_closed": http_status.HTTP_409_CONFLICT,
    "questions_not_available": http_status.HTTP_403_FORBIDDEN,
    "session_not_joinable": http_status.HTTP_409_CONFLICT,
    "session_expired": http_status.HTTP_409_CONFLICT,
    # In-session chat (Sprint 8.3) — validation only; no chat endpoint exists.
    "empty_message": http_status.HTTP_400_BAD_REQUEST,
    "message_too_long": http_status.HTTP_400_BAD_REQUEST,
    # Whiteboard (Sprint 8.4) — validation only; no whiteboard endpoint exists.
    "operation_rejected": http_status.HTTP_422_UNPROCESSABLE_ENTITY,
    # File sharing (Sprint 8.5) — validation only; no file endpoint exists.
    "unsupported_file_type": http_status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    "file_too_large": http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    # Participant signals (Sprint 8.6) — validation only; no signal endpoint exists.
    "unsupported_reaction": http_status.HTTP_422_UNPROCESSABLE_ENTITY,
    # Session recording (Sprint 8.7) — state machine only; no recording endpoint exists.
    "invalid_recording_state": http_status.HTTP_409_CONFLICT,
    # Attendance & presence (Sprint 8.8) — state machine only; no attendance endpoint exists.
    "attendance_locked": http_status.HTTP_409_CONFLICT,
    "ai_report_already_generated": http_status.HTTP_409_CONFLICT,
    "email_already_registered": http_status.HTTP_409_CONFLICT,
    "duplicate_transaction_number": http_status.HTTP_409_CONFLICT,
    # Placement (Phase 8E)
    "placement_attempt_not_found": http_status.HTTP_404_NOT_FOUND,
    "placement_result_not_found": http_status.HTTP_404_NOT_FOUND,
    "placement_incomplete": http_status.HTTP_409_CONFLICT,
    "spoken_attempt_used": http_status.HTTP_409_CONFLICT,
    "placement_reset_required": http_status.HTTP_409_CONFLICT,
    "invalid_placement_question": http_status.HTTP_422_UNPROCESSABLE_ENTITY,
    "invalid_placement_answer": http_status.HTTP_422_UNPROCESSABLE_ENTITY,
    "transcript_locked": http_status.HTTP_409_CONFLICT,
    "interview_incomplete": http_status.HTTP_409_CONFLICT,
    "invalid_assessment_input": http_status.HTTP_422_UNPROCESSABLE_ENTITY,
    "domain_error": http_status.HTTP_422_UNPROCESSABLE_ENTITY,
}

_STATUS_CODE = {
    http_status.HTTP_400_BAD_REQUEST: "validation_error",
    http_status.HTTP_401_UNAUTHORIZED: "not_authenticated",
    http_status.HTTP_403_FORBIDDEN: "permission_denied",
    http_status.HTTP_404_NOT_FOUND: "not_found",
    http_status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    http_status.HTTP_429_TOO_MANY_REQUESTS: "throttled",
}


def api_exception_handler(exc, context):
    # 1) Domain rule violations.
    if isinstance(exc, BusinessRuleError):
        code = getattr(exc, "code", None) or "domain_error"
        status_code = CODE_STATUS.get(code, http_status.HTTP_422_UNPROCESSABLE_ENTITY)
        return Response({"code": code, "detail": str(exc)}, status=status_code)

    # 2) Repository .get() misses → 404.
    if isinstance(exc, ObjectDoesNotExist):
        return Response(
            {"code": "not_found", "detail": str(exc) or "Resource not found."},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    # 3) Database constraint violations (unique/partial-unique/check races that
    #    escape a use case) → 409 Conflict. The raw DB message is NOT echoed to
    #    the client; it is logged server-side instead so nothing leaks.
    if isinstance(exc, IntegrityError):
        logger.warning("IntegrityError surfaced to API layer: %s", exc, exc_info=True)
        return Response(
            {
                "code": "conflict",
                "detail": "The request conflicts with the current state of the resource.",
            },
            status=http_status.HTTP_409_CONFLICT,
        )

    # 4) Fall back to DRF's handler (auth, validation, etc.) but normalize the body.
    response = drf_exception_handler(exc, context)
    if response is not None:
        code = _STATUS_CODE.get(response.status_code, "error")
        detail = response.data
        if isinstance(detail, dict) and set(detail.keys()) == {"detail"}:
            detail = detail["detail"]
        response.data = {"code": code, "detail": detail}
        return response

    # 5) Anything DRF did not handle is an unexpected server error. Never leak the
    #    exception message or a stack trace to the client — log it and return the
    #    standard envelope so the API contract holds for every response.
    logger.exception("Unhandled exception in API request", exc_info=exc)
    return Response(
        {"code": "server_error", "detail": "An unexpected error occurred."},
        status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
