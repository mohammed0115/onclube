"""
Lightweight test factories (plain helpers, no external deps).

Used by the Phase 5 unit tests to build the minimal object graph for each
business rule. Not imported by production code.
"""
from datetime import timedelta

from django.utils import timezone

from apps.accounts.models import InstructorProfile, StudentProfile, User
from apps.ai_reports.models import AIReport
from apps.billing.models import File, PaymentProof, Plan, Subscription
from apps.common.enums import (
    AIReportStatus,
    CEFRLevel,
    NotificationType,
    PaymentProofStatus,
    SessionStatus,
    SubscriptionStatus,
    UserRole,
)
from apps.notifications.models import Notification
from apps.onboarding.models import PlacementAttempt, PlacementResult
from apps.scheduling.models import AvailabilitySlot, Question, Topic
from apps.sessions.models import Session

_counter = {"n": 0}


def _uniq():
    _counter["n"] += 1
    return _counter["n"]


def make_admin(email=None):
    return User.objects.create_user(
        email=email or f"admin{_uniq()}@test.dev",
        password="pw-test-123",
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_staff=True,
    )


def make_student(email=None, level=CEFRLevel.B1):
    user = User.objects.create_user(
        email=email or f"student{_uniq()}@test.dev",
        password="pw-test-123",
        full_name="Test Student",
        role=UserRole.STUDENT,
    )
    profile = StudentProfile.objects.create(user=user, level=level)
    return profile


def make_instructor(email=None):
    user = User.objects.create_user(
        email=email or f"instructor{_uniq()}@test.dev",
        password="pw-test-123",
        full_name="Test Instructor",
        role=UserRole.INSTRUCTOR,
    )
    profile = InstructorProfile.objects.create(user=user, initials="TI", rating=5)
    return profile


def make_plan(sessions_per_month=8, billing_period_days=30, price="220.00"):
    return Plan.objects.create(
        code=f"plan-{_uniq()}",
        name="Regular",
        price=price,
        currency="SAR",
        sessions_per_month=sessions_per_month,
        billing_period_days=billing_period_days,
    )


def make_pending_subscription(student, plan):
    return Subscription.objects.create(
        student=student, plan=plan, status=SubscriptionStatus.PENDING
    )


def make_active_subscription(student, plan, *, sessions=4, days_valid=30):
    """Directly build an ACTIVE subscription (bypasses approval) for booking tests."""
    now = timezone.now()
    sub = Subscription.objects.create(
        student=student,
        plan=plan,
        status=SubscriptionStatus.ACTIVE,
        started_at=now,
        expires_at=now + timedelta(days=days_valid),
        sessions_remaining=sessions,
    )
    student.active_subscription = sub
    student.sessions_remaining = sessions
    student.save(update_fields=["active_subscription", "sessions_remaining"])
    return sub


def make_file(uploaded_by=None):
    return File.objects.create(
        storage_key=f"receipts/{_uniq()}.jpg",
        filename="receipt.jpg",
        content_type="image/jpeg",
        uploaded_by=uploaded_by,
    )


def make_pending_payment_proof(student, plan, subscription=None):
    return PaymentProof.objects.create(
        student=student,
        subscription=subscription,
        plan=plan,
        plan_name=plan.name,
        amount=plan.price,
        currency=plan.currency,
        transaction_number=f"TRX-{_uniq()}",
        transfer_datetime=timezone.now(),
        receipt_file=make_file(uploaded_by=student.user),
        receipt_name="receipt.jpg",
        status=PaymentProofStatus.PENDING,
    )


def make_topic(instructor, *, published=True, with_approved_question=True,
               with_unapproved_question=True):
    topic = Topic.objects.create(
        title="Job Interview Practice",
        category="Career",
        level=CEFRLevel.B1,
        instructor=instructor,
        description="Rehearse common interview questions.",
        sample_prompts=["Tell me about yourself."],
        vocabulary=["motivated", "collaborate"],
        published=published,
    )
    if with_approved_question:
        Question.objects.create(
            topic=topic,
            text="What are you most proud of in your career?",
            approved=True,
            approved_by=instructor.user,
            approved_at=timezone.now(),
            sort_order=1,
        )
    if with_unapproved_question:
        Question.objects.create(
            topic=topic,
            text="Unapproved AI draft question",
            ai_assisted=True,
            approved=False,
            sort_order=2,
        )
    return topic


def make_slot(instructor, *, start_at=None, days_ahead=3):
    if start_at is None:
        start_at = timezone.now() + timedelta(days=days_ahead)
    return AvailabilitySlot.objects.create(instructor=instructor, start_at=start_at)


def make_booking(*, student=None, instructor=None, plan=None, sessions=4, days_ahead=3):
    """Build a confirmed booking via the real booking service (active sub + slot)."""
    from apps.scheduling.services import create_booking

    instructor = instructor or make_instructor()
    student = student or make_student()
    plan = plan or make_plan()
    make_active_subscription(student, plan, sessions=sessions)
    topic = make_topic(instructor)
    slot = make_slot(instructor, days_ahead=days_ahead)
    return create_booking(student, topic, slot)


def make_session(booking=None, *, status=SessionStatus.SCHEDULED, agora_channel=None):
    booking = booking or make_booking()
    # A booking now owns its live-session room from creation (create_booking).
    # Reuse it and apply the requested status/channel so factories stay tolerant.
    session, _ = Session.objects.get_or_create(
        booking=booking,
        defaults=dict(status=status, agora_channel=agora_channel),
    )
    session.status = status
    session.agora_channel = agora_channel
    session.save()
    return session


def make_ai_report(*, booking=None, session=None, status=AIReportStatus.READY):
    booking = booking or make_booking()
    if session is None:
        session = make_session(
            booking, status=SessionStatus.COMPLETED, agora_channel=f"chan-{_uniq()}"
        )
    return AIReport.objects.create(
        session=session,
        booking=booking,
        student=booking.student,
        topic_title=booking.topic_title,
        instructor_name=booking.instructor_name,
        session_date=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        overall_score=82,
        skills=[{"label": "Fluency", "value": 80, "color": "#10B981"}],
        mistakes=[{"label": "Past tense form", "example": "“I goed” → “I went”"}],
        recommendations=["Review irregular past-tense verbs."],
        instructor_note="Great progress — keep practising articles.",
        status=status,
        generated_at=timezone.now() if status == AIReportStatus.READY else None,
    )


def make_notification(user, *, type=NotificationType.BOOKING_CONFIRMED, read=False):
    return Notification.objects.create(
        user=user, type=type, title="Test notification", body="hello", read=read
    )


def make_placement(student):
    attempt = PlacementAttempt.objects.create(
        student=student, answers=[], submitted_at=timezone.now()
    )
    result = PlacementResult.objects.create(
        attempt=attempt,
        student=student,
        level=CEFRLevel.B1,
        level_label="Intermediate",
        summary="Solid conversational foundation.",
        skills=[{"label": "Speaking", "value": 68, "color": "#4F46E5"}],
    )
    return attempt, result
