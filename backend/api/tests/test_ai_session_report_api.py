"""
AI Session Report — API + security (Sprint 9).

Covers the generate endpoint (idempotent), the admin-only regenerate endpoint, and
the security invariant: the API exposes ONLY the validated report content — never
the prompt, API key, provider name, raw output, or chain of thought.
"""
import re

import pytest
from rest_framework.test import APIClient

from apps.common.enums import SessionStatus, TranscriptSource
from apps.common.factories import make_admin, make_booking, make_session, make_student
from apps.sessions.models import SessionTranscript

pytestmark = pytest.mark.django_db

REPORT_KEYS = {
    "overallSummary", "grammarFeedback", "vocabularyFeedback", "fluencyFeedback",
    "pronunciationFeedback", "strengths", "weaknesses", "recommendedTopics",
    "homework", "nextLessonFocus", "confidenceScore",
}


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _completed_session():
    booking = make_booking(days_ahead=0)
    session = make_session(booking, status=SessionStatus.COMPLETED, agora_channel="c1")
    SessionTranscript.objects.create(
        session=session,
        content=[{"speaker": "student", "text": "I fixed a bug today.", "ts": 0}],
        source=TranscriptSource.MANUAL,
    )
    return booking, session


def test_generate_then_fetch_report_returns_validated_content():
    booking, session = _completed_session()
    student = booking.student.user

    gen = client_for(student).post(f"/api/v1/sessions/{session.id}/report/generate/")
    assert gen.status_code == 201
    report_id = gen.data["reportId"]

    detail = client_for(student).get(f"/api/v1/reports/{report_id}/")
    assert detail.status_code == 200
    content = detail.data["content"]
    assert set(content.keys()) == REPORT_KEYS
    assert isinstance(content["confidenceScore"], int)
    assert content["overallSummary"]


def test_report_never_leaks_prompt_provider_or_raw_output():
    booking, session = _completed_session()
    student = booking.student.user
    gen = client_for(student).post(f"/api/v1/sessions/{session.id}/report/generate/")
    detail = client_for(student).get(f"/api/v1/reports/{gen.data['reportId']}/")

    # The content object holds EXACTLY the 11 validated fields.
    assert set(detail.data["content"].keys()) == REPORT_KEYS
    # Nothing sensitive appears anywhere in the serialized response.
    blob = str(detail.data).lower()
    for banned in ("prompt", "api_key", "apikey", "system_message", "systemmessage",
                   "provider_name", "providername", "fallback", "raw", "chain", "openai"):
        assert banned not in blob


def test_generate_is_idempotent_over_the_api():
    booking, session = _completed_session()
    student = booking.student.user
    a = client_for(student).post(f"/api/v1/sessions/{session.id}/report/generate/")
    b = client_for(student).post(f"/api/v1/sessions/{session.id}/report/generate/")
    assert a.status_code == 201 and b.status_code == 201
    assert a.data["reportId"] == b.data["reportId"]  # same report; not regenerated


def test_generate_before_completion_conflicts():
    booking = make_booking(days_ahead=0)
    session = make_session(booking, status=SessionStatus.SCHEDULED)
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/report/generate/")
    assert resp.status_code == 409


def test_only_admin_may_regenerate():
    booking, session = _completed_session()
    client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/report/generate/")

    # A student hitting the admin regenerate endpoint is forbidden.
    student_try = client_for(booking.student.user).post(
        f"/api/v1/admin/sessions/{session.id}/report/regenerate/"
    )
    assert student_try.status_code == 403

    # An admin can regenerate.
    admin_try = client_for(make_admin()).post(f"/api/v1/admin/sessions/{session.id}/report/regenerate/")
    assert admin_try.status_code == 201


def test_wrong_student_cannot_generate_via_api():
    booking, session = _completed_session()
    resp = client_for(make_student().user).post(f"/api/v1/sessions/{session.id}/report/generate/")
    assert resp.status_code == 403
