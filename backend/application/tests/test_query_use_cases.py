"""
Query / read use-case tests (Phase 5.5).

Focus: ownership/permission enforcement, the full-question gate, DTO-only returns,
and that server-only fields never appear in DTOs.
"""
import dataclasses

import pytest

from apps.common.enums import AIReportStatus
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_ai_report,
    make_booking,
    make_instructor,
    make_notification,
    make_pending_payment_proof,
    make_placement,
    make_plan,
    make_session,
    make_slot,
    make_student,
    make_topic,
)
from application import mappers
from application.accounts.queries import GetCurrentUserProfileUseCase
from application.admin_ops.queries import GetAdminDashboardUseCase
from application.ai_reports.queries import GetAIReportDetailUseCase
from application.billing.queries import ListStudentBillingHistoryUseCase
from application.notifications.queries import ListNotificationsUseCase
from application.scheduling.queries import (
    GetBookingDetailUseCase,
    GetQuestionsForBookingUseCase,
    GetTopicPreviewOrFullUseCase,
    ListInstructorTopicsUseCase,
)
from application.sessions.queries import GetSessionDetailUseCase
from apps.onboarding.models import PlacementQuestion
from domain.dtos import TopicFullResult, TopicPreviewResult, TranscriptResult
from domain.exceptions import PermissionDenied, QuestionsNotAvailable

pytestmark = pytest.mark.django_db


# ── Ownership: bookings ───────────────────────────────────────────────────────
def test_student_cannot_read_another_students_booking():
    booking = make_booking()  # owned by some student X
    intruder = make_student()  # different student
    with pytest.raises(PermissionDenied):
        GetBookingDetailUseCase().execute(actor=intruder.user, booking_id=booking.id)


def test_student_can_read_own_booking():
    booking = make_booking()
    owner = booking.student.user
    result = GetBookingDetailUseCase().execute(actor=owner, booking_id=booking.id)
    assert result.id == str(booking.id)


# ── Ownership: AI reports ─────────────────────────────────────────────────────
def test_student_cannot_read_another_students_ai_report():
    report = make_ai_report()
    intruder = make_student()
    with pytest.raises(PermissionDenied):
        GetAIReportDetailUseCase().execute(actor=intruder.user, report_id=report.id)


def test_ai_report_detail_includes_mistakes_recommendations_vocabulary_and_note():
    report = make_ai_report()
    owner = report.student.user
    result = GetAIReportDetailUseCase().execute(actor=owner, report_id=report.id)

    assert result.mistakes and result.mistakes[0]["label"] == "Past tense form"
    assert result.recommendations == ["Review irregular past-tense verbs."]
    assert result.vocabulary == ["motivated", "collaborate"]  # from the topic
    assert result.instructor_note.startswith("Great progress")


# ── Ownership: instructor topics/sessions ─────────────────────────────────────
def test_instructor_cannot_read_another_instructors_session():
    booking = make_booking()  # has instructor A
    session = make_session(booking)
    other_instructor = make_instructor()
    with pytest.raises(PermissionDenied):
        GetSessionDetailUseCase().execute(actor=other_instructor.user, session_id=session.id)


def test_instructor_topics_list_is_owner_scoped():
    instr_a = make_instructor()
    instr_b = make_instructor()
    make_topic(instr_a)  # topic owned by A

    result_b = ListInstructorTopicsUseCase().execute(actor=instr_b.user)
    assert result_b == []  # B sees none of A's topics


# ── Full-question gate (§2.5) ─────────────────────────────────────────────────
def test_full_questions_hidden_until_booking_confirmed():
    instructor = make_instructor()
    student = make_student()
    topic = make_topic(instructor)

    preview = GetTopicPreviewOrFullUseCase().execute(actor=student.user, topic_id=topic.id)
    assert isinstance(preview, TopicPreviewResult)
    assert preview.mode == "preview"

    # GetQuestionsForBooking refuses before a confirmed booking.
    with pytest.raises(QuestionsNotAvailable):
        GetQuestionsForBookingUseCase().execute(actor=student.user, topic_id=topic.id)

    # Confirm a booking, then full questions become visible (approved only).
    make_active_subscription(student, make_plan(), sessions=4)
    slot = make_slot(instructor)
    from apps.scheduling.services import create_booking

    create_booking(student, topic, slot)

    full = GetTopicPreviewOrFullUseCase().execute(actor=student.user, topic_id=topic.id)
    assert isinstance(full, TopicFullResult)
    assert full.mode == "full"
    assert len(full.questions) == 1  # only the approved question


# ── Server-only field protection ──────────────────────────────────────────────
def test_placement_question_dto_never_exposes_correct_index():
    q = PlacementQuestion.objects.create(
        prompt="Pick the correct sentence",
        options=["I go", "I goes"],
        correct_index=0,
        skill="grammar",
    )
    dto = mappers.placement_question(q)
    keys = set(dataclasses.asdict(dto).keys())
    assert "correct_index" not in keys
    assert keys == {"id", "prompt", "options", "skill"}


# ── Transcript returns a DTO, not a dict ──────────────────────────────────────
def test_attach_transcript_returns_transcript_result():
    from application.sessions.use_cases import AttachTranscriptUseCase

    session = make_session()
    actor = session.booking.student.user
    result = AttachTranscriptUseCase().execute(
        actor=actor,
        session_id=session.id,
        content=[{"speaker": "student", "text": "hi", "ts": 0}],
    )
    assert isinstance(result, TranscriptResult)
    assert result.session_id == str(session.id)


# ── Billing history is student-owned ──────────────────────────────────────────
def test_billing_history_is_student_owned():
    student = make_student()
    plan = make_plan()
    make_pending_payment_proof(student, plan)
    make_pending_payment_proof(student, plan)

    # Another student's proof must not leak in.
    other = make_student()
    make_pending_payment_proof(other, plan)

    history = ListStudentBillingHistoryUseCase().execute(actor=student.user)
    assert len(history) == 2
    assert all(item.receipt_url for item in history)  # signed urls present


def test_billing_history_requires_student():
    admin = make_admin()  # a User with role=admin, no student profile
    with pytest.raises(PermissionDenied):
        ListStudentBillingHistoryUseCase().execute(actor=admin)


# ── Admin dashboard is admin-only ─────────────────────────────────────────────
def test_admin_dashboard_is_admin_only():
    student = make_student()
    with pytest.raises(PermissionDenied):
        GetAdminDashboardUseCase().execute(actor=student.user)


def test_admin_dashboard_returns_for_admin():
    admin = make_admin()
    student = make_student()
    make_pending_payment_proof(student, make_plan())
    result = GetAdminDashboardUseCase().execute(actor=admin)
    assert result.pending_payments >= 1
    assert result.pending_proofs  # at least one queue item


# ── Notification list is user-owned ───────────────────────────────────────────
def test_notification_list_is_user_owned():
    student = make_student()
    make_notification(student.user)
    make_notification(student.user)

    other = make_student()
    make_notification(other.user)

    result = ListNotificationsUseCase().execute(actor=student.user)
    assert len(result) == 2


# ── /me profile ───────────────────────────────────────────────────────────────
def test_current_user_profile_returns_student_fields():
    student = make_student()
    result = GetCurrentUserProfileUseCase().execute(actor=student.user)
    assert result.id == str(student.user.id)
    assert result.role == "student"
    assert result.sessions_remaining is not None
