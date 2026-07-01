"""Phase 6C API tests — the newly wired thin endpoints."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import AIReportStatus, SessionStatus
from apps.common.factories import (
    make_active_subscription,
    make_ai_report,
    make_booking,
    make_instructor,
    make_notification,
    make_plan,
    make_session,
    make_slot,
    make_student,
    make_topic,
)
from apps.scheduling.models import Question

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ── register (public) ─────────────────────────────────────────────────────────
def test_register_endpoint_creates_student():
    resp = APIClient().post(
        "/api/v1/auth/register/",
        {"fullName": "Web Signup", "email": "web@example.com", "password": "pw-secret-123"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["role"] == "student"
    assert "password" not in resp.data and "passwordHash" not in resp.data


def test_register_duplicate_email_maps_to_409():
    make_student(email="taken@example.com")
    resp = APIClient().post(
        "/api/v1/auth/register/",
        {"fullName": "X", "email": "taken@example.com", "password": "pw-secret-123"},
        format="json",
    )
    assert resp.status_code == 409
    assert resp.data["code"] == "email_already_registered"


# ── submit payment proof (multipart) ──────────────────────────────────────────
def test_submit_payment_proof_endpoint():
    student = make_student()
    plan = make_plan()
    receipt = SimpleUploadedFile("receipt.jpg", b"bytes", content_type="image/jpeg")
    resp = client_for(student.user).post(
        "/api/v1/billing/payment-proof/",
        {
            "planId": str(plan.id),
            "transactionNumber": "TRX-API-1",
            "transferDatetime": timezone.now().isoformat(),
            "amount": "220.00",
            "receipt": receipt,
        },
        format="multipart",
    )
    assert resp.status_code == 201
    assert resp.data["status"] == "pending_review"
    assert resp.data["transactionNumber"] == "TRX-API-1"
    assert resp.data["receiptUrl"]


def test_submit_payment_proof_duplicate_transaction_number_409():
    student = make_student()
    plan = make_plan()

    def submit():
        return client_for(student.user).post(
            "/api/v1/billing/payment-proof/",
            {
                "planId": str(plan.id),
                "transactionNumber": "TRX-DUP-API",
                "transferDatetime": timezone.now().isoformat(),
                "amount": "220.00",
                "receipt": SimpleUploadedFile("r.jpg", b"b", content_type="image/jpeg"),
            },
            format="multipart",
        )

    assert submit().status_code == 201
    dup = submit()
    assert dup.status_code == 409
    assert dup.data["code"] == "duplicate_transaction_number"


# ── set goal ──────────────────────────────────────────────────────────────────
def test_set_goal_endpoint():
    from apps.onboarding.models import Goal

    goal = Goal.objects.create(code="work", label="Work & Career")
    student = make_student()
    resp = client_for(student.user).put(
        "/api/v1/me/goal/", {"goalId": str(goal.id)}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["goalId"] == str(goal.id)


# ── update profile ────────────────────────────────────────────────────────────
def test_update_me_endpoint():
    student = make_student()
    resp = client_for(student.user).patch(
        "/api/v1/me/", {"fullName": "Updated Name"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["fullName"] == "Updated Name"


# ── instructor authoring ──────────────────────────────────────────────────────
def test_instructor_topic_create_then_publish_flow():
    instructor = make_instructor()
    client = client_for(instructor.user)

    create = client.post(
        "/api/v1/instructor/topics/create/",
        {"title": "Interviews", "category": "Career", "level": "B1", "description": "d"},
        format="json",
    )
    assert create.status_code == 201
    topic_id = create.data["id"]

    # Publish should fail without an approved question.
    fail = client.post(f"/api/v1/instructor/topics/{topic_id}/publish/")
    assert fail.status_code == 409

    q = client.post(
        f"/api/v1/instructor/topics/{topic_id}/questions/",
        {"text": "Tell me about yourself."},
        format="json",
    )
    assert q.status_code == 201 and q.data["approved"] is True

    ok = client.post(f"/api/v1/instructor/topics/{topic_id}/publish/")
    assert ok.status_code == 200


def test_instructor_cannot_publish_another_instructors_topic():
    owner = make_instructor()
    topic = make_topic(owner)
    other = make_instructor()
    resp = client_for(other.user).post(f"/api/v1/instructor/topics/{topic.id}/publish/")
    assert resp.status_code == 403


def test_approve_ai_question_endpoint():
    instructor = make_instructor()
    topic = make_topic(instructor, with_approved_question=False, with_unapproved_question=True)
    draft = Question.objects.get(topic=topic, approved=False)
    resp = client_for(instructor.user).post(
        f"/api/v1/instructor/topics/{topic.id}/questions/{draft.id}/approve/"
    )
    assert resp.status_code == 200
    assert resp.data["approved"] is True


# ── set availability ──────────────────────────────────────────────────────────
def test_set_availability_endpoint():
    instructor = make_instructor()
    t1 = (timezone.now() + timezone.timedelta(days=1)).isoformat()
    resp = client_for(instructor.user).put(
        "/api/v1/instructor/availability/set/",
        {"slots": [{"startAt": t1, "durationMinutes": 45}]},
        format="json",
    )
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["status"] == "open"


# ── notification read ─────────────────────────────────────────────────────────
def test_notification_read_endpoint_owner_only():
    student = make_student()
    note = make_notification(student.user)
    ok = client_for(student.user).post(f"/api/v1/notifications/{note.id}/read/")
    assert ok.status_code == 200 and ok.data["read"] is True

    intruder = make_student()
    other = make_notification(intruder.user)
    denied = client_for(student.user).post(f"/api/v1/notifications/{other.id}/read/")
    assert denied.status_code == 403


# ── session report read (200 ready / 202 pending) ─────────────────────────────
def test_session_report_endpoint_ready():
    report = make_ai_report(status=AIReportStatus.READY)
    actor = report.student.user
    resp = client_for(actor).get(f"/api/v1/sessions/{report.session_id}/report/")
    assert resp.status_code == 200
    assert resp.data["mistakes"]


def test_session_report_endpoint_pending_returns_202():
    booking = make_booking()
    session = make_session(booking, status=SessionStatus.COMPLETED, agora_channel="c1")
    # A pending report (no scores yet).
    from apps.ai_reports.models import AIReport

    AIReport.objects.create(
        session=session,
        booking=booking,
        student=booking.student,
        topic_title=booking.topic_title,
        instructor_name=booking.instructor_name,
        session_date=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        status=AIReportStatus.PENDING,
    )
    resp = client_for(booking.student.user).get(f"/api/v1/sessions/{session.id}/report/")
    assert resp.status_code == 202
