"""Use-case tests — scheduling."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.common.enums import BookingStatus, SlotStatus
from apps.common.factories import (
    make_active_subscription,
    make_instructor,
    make_plan,
    make_slot,
    make_student,
    make_topic,
)
from apps.scheduling.models import Booking
from application.scheduling.use_cases import (
    CancelBookingUseCase,
    CreateBookingUseCase,
    GetTopicForStudentUseCase,
)
from domain.exceptions import NoActiveSubscription, SlotAlreadyBooked

pytestmark = pytest.mark.django_db


def _student_world(sessions=4, days_ahead=5):
    instructor = make_instructor()
    student = make_student()
    plan = make_plan()
    sub = make_active_subscription(student, plan, sessions=sessions)
    topic = make_topic(instructor)
    slot = make_slot(instructor, days_ahead=days_ahead)
    return student, instructor, topic, slot, sub


def test_create_booking_use_case_fails_without_approved_subscription():
    instructor = make_instructor()
    student = make_student()  # no subscription
    topic = make_topic(instructor)
    slot = make_slot(instructor)

    with pytest.raises(NoActiveSubscription):
        CreateBookingUseCase().execute(
            actor=student.user, topic_id=topic.id, slot_id=slot.id
        )


def test_create_booking_use_case_decrements_sessions_remaining():
    student, instructor, topic, slot, sub = _student_world(sessions=4)
    result = CreateBookingUseCase().execute(
        actor=student.user, topic_id=topic.id, slot_id=slot.id
    )
    assert result.status == BookingStatus.UPCOMING
    assert result.sessions_remaining == 3
    sub.refresh_from_db()
    assert sub.sessions_remaining == 3


def test_create_booking_use_case_prevents_double_booking():
    student_a, instructor, topic, slot, _ = _student_world()
    CreateBookingUseCase().execute(actor=student_a.user, topic_id=topic.id, slot_id=slot.id)

    student_b = make_student()
    make_active_subscription(student_b, make_plan(), sessions=4)
    with pytest.raises(SlotAlreadyBooked):
        CreateBookingUseCase().execute(
            actor=student_b.user, topic_id=topic.id, slot_id=slot.id
        )
    slot.refresh_from_db()
    assert slot.status == SlotStatus.BOOKED


def test_cancel_booking_use_case_returns_credit_before_24h():
    student, instructor, topic, slot, sub = _student_world(sessions=4, days_ahead=5)
    booking = CreateBookingUseCase().execute(
        actor=student.user, topic_id=topic.id, slot_id=slot.id
    )

    result = CancelBookingUseCase().execute(
        actor=student.user, booking_id=booking.booking_id, now=timezone.now()
    )
    assert result.credit_refunded is True
    assert result.sessions_remaining == 4  # 3 after booking, +1 refunded


def test_cancel_booking_use_case_does_not_return_credit_within_24h():
    student, instructor, topic, slot, sub = _student_world(sessions=4, days_ahead=5)
    booking = CreateBookingUseCase().execute(
        actor=student.user, topic_id=topic.id, slot_id=slot.id
    )
    db_booking = Booking.objects.get(pk=booking.booking_id)
    within = db_booking.scheduled_at - timedelta(hours=1)

    result = CancelBookingUseCase().execute(
        actor=student.user, booking_id=booking.booking_id, now=within
    )
    assert result.credit_refunded is False
    assert result.sessions_remaining == 3  # no refund


def test_get_topic_for_student_use_case_returns_preview_without_booking():
    instructor = make_instructor()
    student = make_student()
    topic = make_topic(instructor)

    result = GetTopicForStudentUseCase().execute(actor=student.user, topic_id=topic.id)
    assert result.mode == "preview"
    assert result.questions is None
    assert result.vocabulary is None
    assert result.sample_prompts == ["Tell me about yourself."]


def test_get_topic_for_student_use_case_returns_full_after_confirmed_booking():
    student, instructor, topic, slot, sub = _student_world()
    CreateBookingUseCase().execute(actor=student.user, topic_id=topic.id, slot_id=slot.id)

    result = GetTopicForStudentUseCase().execute(actor=student.user, topic_id=topic.id)
    assert result.mode == "full"
    assert result.vocabulary == ["motivated", "collaborate"]
    assert len(result.questions) == 1  # unapproved question excluded
