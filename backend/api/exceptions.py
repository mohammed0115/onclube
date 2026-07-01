"""
Global DRF exception handler.

Maps domain exceptions (BusinessRuleError + subclasses) to HTTP responses by
their `.code`, and normalizes repository `Model.DoesNotExist` to 404. All API
error bodies share the shape: {"code": <str>, "detail": <str>}.

This is the ONLY place domain → HTTP translation happens, so views never catch
domain exceptions themselves.
"""
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.common.exceptions import BusinessRuleError

# Domain `.code` → HTTP status. Anything unmapped falls back to 422.
CODE_STATUS = {
    "permission_denied": http_status.HTTP_403_FORBIDDEN,
    "invalid_state": http_status.HTTP_409_CONFLICT,
    "no_active_subscription": http_status.HTTP_403_FORBIDDEN,
    "subscription_expired": http_status.HTTP_409_CONFLICT,
    "no_sessions_remaining": http_status.HTTP_409_CONFLICT,
    "slot_unavailable": http_status.HTTP_409_CONFLICT,
    "slot_instructor_mismatch": http_status.HTTP_409_CONFLICT,
    "cancellation_window_closed": http_status.HTTP_409_CONFLICT,
    "questions_not_available": http_status.HTTP_403_FORBIDDEN,
    "session_not_joinable": http_status.HTTP_409_CONFLICT,
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

    # 3) Fall back to DRF's handler (auth, validation, etc.) but normalize the body.
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    code = _STATUS_CODE.get(response.status_code, "error")
    detail = response.data
    if isinstance(detail, dict) and set(detail.keys()) == {"detail"}:
        detail = detail["detail"]
    response.data = {"code": code, "detail": detail}
    return response
