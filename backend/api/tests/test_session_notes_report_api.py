"""Part 5 — instructor post-session notes + AI report accept/regenerate."""
import pytest
from rest_framework.test import APIClient

from apps.common.enums import AIReportStatus, SessionStatus
from apps.common.factories import make_ai_report, make_booking, make_session, make_student

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_instructor_saves_structured_session_notes():
    session = make_session(status=SessionStatus.COMPLETED, agora_channel="c1")
    resp = client_for(session.booking.instructor.user).post(
        f"/api/v1/sessions/{session.id}/notes/",
        {"participation": "Great", "strengths": "Vocab", "weaknesses": "Tenses", "homework": "Unit 3", "next_focus": "Past tense"},
        format="json",
    )
    assert resp.status_code == 200
    session.refresh_from_db()
    assert session.instructor_notes["homework"] == "Unit 3"
    assert session.instructor_notes["next_focus"] == "Past tense"


def test_student_cannot_write_notes():
    session = make_session(status=SessionStatus.COMPLETED, agora_channel="c1")
    resp = client_for(session.booking.student.user).post(
        f"/api/v1/sessions/{session.id}/notes/", {"homework": "x"}, format="json"
    )
    assert resp.status_code in (403, 404)


def test_instructor_accepts_report():
    session = make_session(status=SessionStatus.COMPLETED, agora_channel="c1")
    report = make_ai_report(session=session, status=AIReportStatus.READY)
    resp = client_for(session.booking.instructor.user).post(
        f"/api/v1/sessions/{session.id}/report/accept/", {"note": "Looks accurate"}, format="json"
    )
    assert resp.status_code == 200
    report.refresh_from_db()
    assert report.instructor_reviewed is True and report.instructor_note == "Looks accurate"


def test_instructor_can_regenerate_own_report():
    session = make_session(status=SessionStatus.COMPLETED, agora_channel="c1")
    make_ai_report(session=session, status=AIReportStatus.READY)
    resp = client_for(session.booking.instructor.user).post(
        f"/api/v1/sessions/{session.id}/report/regenerate/"
    )
    assert resp.status_code == 201


def test_other_instructor_cannot_regenerate():
    session = make_session(status=SessionStatus.COMPLETED, agora_channel="c1")
    make_ai_report(session=session, status=AIReportStatus.READY)
    other = make_booking().instructor  # different instructor
    resp = client_for(other.user).post(f"/api/v1/sessions/{session.id}/report/regenerate/")
    assert resp.status_code in (403, 404)
