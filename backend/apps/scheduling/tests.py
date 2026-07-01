"""
Scheduling business-rule tests:
  - cannot book without an active (approved) subscription
  - expired subscription cannot be used for booking
  - sessions_remaining floor is enforced at booking time
  - double booking on the same slot is prevented
  - cancel > 24h before the session returns the credit
  - cancel <= 24h before the session does NOT return the credit
  - full questions are hidden without a confirmed booking
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.common.enums import BookingStatus, SlotStatus, SubscriptionStatus
from apps.common.exceptions import BusinessRuleError
from apps.common.factories import (
    make_active_subscription,
    make_instructor,
    make_plan,
    make_slot,
    make_student,
    make_topic,
)
from apps.scheduling.services import (
    cancel_booking,
    create_booking,
    get_topic_for_student,
)

pytestmark = pytest.mark.django_db


def _booked_world(sessions=4, days_ahead=3):
    instructor = make_instructor()
    student = make_student()
    plan = make_plan()
    sub = make_active_subscription(student, plan, sessions=sessions)
    topic = make_topic(instructor)
    slot = make_slot(instructor, days_ahead=days_ahead)
    return student, instructor, topic, slot, sub


def test_cannot_book_without_active_subscription():
    instructor = make_instructor()
    student = make_student()  # no subscription at all
    topic = make_topic(instructor)
    slot = make_slot(instructor)

    with pytest.raises(BusinessRuleError) as exc:
        create_booking(student, topic, slot)
    assert exc.value.code == "no_active_subscription"
    slot.refresh_from_db()
    assert slot.status == SlotStatus.OPEN


def test_expired_subscription_cannot_book():
    student, instructor, topic, slot, sub = _booked_world()
    sub.expires_at = timezone.now() - timedelta(hours=1)
    sub.save(update_fields=["expires_at"])

    with pytest.raises(BusinessRuleError) as exc:
        create_booking(student, topic, slot)
    assert exc.value.code == "subscription_expired"


def test_booking_decrements_sessions_and_floor_is_enforced():
    student, instructor, topic, slot, sub = _booked_world(sessions=1)
    booking = create_booking(student, topic, slot)
    assert booking.status == BookingStatus.UPCOMING
    sub.refresh_from_db()
    assert sub.sessions_remaining == 0

    # No credit left -> a second booking attempt is refused (floor at zero).
    slot2 = make_slot(instructor, days_ahead=4)
    with pytest.raises(BusinessRuleError) as exc:
        create_booking(student, topic, slot2)
    assert exc.value.code == "no_sessions_remaining"


def test_double_booking_is_prevented():
    student_a, instructor, topic, slot, _ = _booked_world()
    create_booking(student_a, topic, slot)

    slot.refresh_from_db()
    assert slot.status == SlotStatus.BOOKED

    # A different student with their own active sub cannot take the same slot.
    student_b = make_student()
    make_active_subscription(student_b, make_plan(), sessions=4)
    with pytest.raises(BusinessRuleError) as exc:
        create_booking(student_b, topic, slot)
    assert exc.value.code == "slot_unavailable"


def test_cancel_before_24h_returns_credit():
    student, instructor, topic, slot, sub = _booked_world(sessions=4, days_ahead=5)
    booking = create_booking(student, topic, slot)
    sub.refresh_from_db()
    assert sub.sessions_remaining == 3  # decremented by booking

    # "now" is well outside the 24h window (session is 5 days out).
    cancelled = cancel_booking(booking, now=timezone.now())
    assert cancelled.status == BookingStatus.CANCELLED
    assert cancelled.credit_refunded is True

    sub.refresh_from_db()
    assert sub.sessions_remaining == 4  # credit returned
    slot.refresh_from_db()
    assert slot.status == SlotStatus.OPEN


def test_cancel_within_24h_does_not_return_credit():
    student, instructor, topic, slot, sub = _booked_world(sessions=4, days_ahead=5)
    booking = create_booking(student, topic, slot)
    sub.refresh_from_db()
    assert sub.sessions_remaining == 3

    # "now" is only 1 hour before the session -> inside the 24h window.
    within = booking.scheduled_at - timedelta(hours=1)
    cancelled = cancel_booking(booking, now=within)
    assert cancelled.status == BookingStatus.CANCELLED
    assert cancelled.credit_refunded is False

    sub.refresh_from_db()
    assert sub.sessions_remaining == 3  # NO credit returned
    slot.refresh_from_db()
    assert slot.status == SlotStatus.OPEN  # slot still released


def test_full_questions_hidden_without_confirmed_booking():
    instructor = make_instructor()
    student = make_student()
    topic = make_topic(instructor)  # 1 approved + 1 unapproved question

    preview = get_topic_for_student(student, topic)
    assert preview["mode"] == "preview"
    assert "questions" not in preview
    assert "vocabulary" not in preview
    assert preview["sample_prompts"] == ["Tell me about yourself."]

    # After a confirmed booking, the full (approved-only) set is visible.
    make_active_subscription(student, make_plan(), sessions=4)
    slot = make_slot(instructor)
    create_booking(student, topic, slot)

    full = get_topic_for_student(student, topic)
    assert full["mode"] == "full"
    assert full["vocabulary"] == ["motivated", "collaborate"]
    assert len(full["questions"]) == 1  # unapproved question excluded
    assert full["questions"][0]["text"] == "What are you most proud of in your career?"
