"""
Scheduling business-rule services.

Encodes: §2.1 no double booking, §2.3 sessions ≥ 0, §2.4 expired subscription
blocks booking, Business Rule 8 cancellation credit window, and §2.5 question
visibility gate.
"""
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.admin_ops.models import AdminAction
from apps.common.enums import (
    AdminActionType,
    BookingStatus,
    NotificationType,
    SlotStatus,
    SubscriptionStatus,
)
from apps.common.exceptions import BusinessRuleError
from apps.billing.models import Subscription
from apps.notifications.models import Notification
from domain.exceptions import (
    InsufficientSessionCredits,
    InvalidStateTransition,
    NoActiveSubscription,
    SlotAlreadyBooked,
    SubscriptionExpired,
)
from domain.rules.scheduling import (
    CANCELLATION_CREDIT_WINDOW,  # re-exported for backward compatibility
    cancellation_refunds_credit,
)

from .models import AvailabilitySlot, Booking, Question, Topic


@transaction.atomic
def create_booking(student, topic: Topic, slot: AvailabilitySlot) -> Booking:
    """
    Book a slot for a student.

    Rules enforced (all in one transaction):
      §2.1  the slot must be OPEN; OneToOne(slot) + status flip prevent double booking.
      §2.2  student needs an active (approved) subscription.
      §2.4  subscription must not be expired.
      §2.3  sessions_remaining is decremented with a guarded update, never below 0.
    """
    slot = AvailabilitySlot.objects.select_for_update().get(pk=slot.pk)
    if slot.status != SlotStatus.OPEN:
        raise SlotAlreadyBooked()

    if slot.instructor_id != topic.instructor_id:
        raise BusinessRuleError(
            "Slot does not belong to the topic's instructor.", code="slot_instructor_mismatch"
        )

    subscription = (
        Subscription.objects.select_for_update()
        .filter(student=student, status=SubscriptionStatus.ACTIVE)
        .first()
    )
    if subscription is None:
        raise NoActiveSubscription("An approved, active subscription is required to book.")

    now = timezone.now()
    if subscription.expires_at is None or subscription.expires_at <= now:
        raise SubscriptionExpired()

    # §2.3 — guarded decrement; 0 rows updated means no credit left.
    decremented = Subscription.objects.filter(
        pk=subscription.pk, sessions_remaining__gt=0
    ).update(sessions_remaining=F("sessions_remaining") - 1)
    if not decremented:
        raise InsufficientSessionCredits()
    subscription.refresh_from_db(fields=["sessions_remaining"])

    booking = Booking.objects.create(
        student=student,
        topic=topic,
        topic_title=topic.title,
        instructor=topic.instructor,
        instructor_name=topic.instructor.user.full_name,
        slot=slot,
        subscription=subscription,
        scheduled_at=slot.start_at,
        duration_minutes=slot.duration_minutes,
        status=BookingStatus.UPCOMING,
    )

    slot.status = SlotStatus.BOOKED
    slot.save(update_fields=["status", "updated_at"])

    # Keep the student mirror in sync.
    if student.active_subscription_id == subscription.pk:
        student.sessions_remaining = subscription.sessions_remaining
        student.save(update_fields=["sessions_remaining", "updated_at"])

    # A booking always has exactly one live-session room. Create it eagerly
    # (status=scheduled) so the student/instructor can join straight from the
    # dashboard. The session repository resolves either a session id or a
    # booking id, so the dashboard's booking-id links open this room.
    from apps.sessions.models import Session
    from apps.common.enums import SessionStatus

    Session.objects.create(booking=booking, status=SessionStatus.SCHEDULED)

    Notification.objects.create(
        user=student.user,
        type=NotificationType.BOOKING_CONFIRMED,
        title="Booking confirmed",
        body=f"{topic.title} on {slot.start_at:%b %d, %H:%M}.",
        data={"booking_id": str(booking.pk)},
    )
    return booking


@transaction.atomic
def cancel_booking(booking: Booking, *, now=None, admin=None, force_credit=None) -> Booking:
    """
    Cancel a booking and apply the credit decision (Business Rule 8).

    Default (self-serve): credit is returned only when cancelling > 24h before the
    session. `force_credit` lets an admin override either way; an override is
    audited as booking_cancel_override.
    """
    now = now or timezone.now()
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status != BookingStatus.UPCOMING:
        raise InvalidStateTransition("Only an upcoming booking can be cancelled.")

    auto_refund = cancellation_refunds_credit(
        scheduled_at=booking.scheduled_at, now=now
    )
    is_override = force_credit is not None and force_credit != auto_refund
    refund = auto_refund if force_credit is None else force_credit

    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = now
    booking.credit_refunded = refund
    booking.save(update_fields=["status", "cancelled_at", "credit_refunded", "updated_at"])

    # Release the slot.
    slot = booking.slot
    slot.status = SlotStatus.OPEN
    slot.save(update_fields=["status", "updated_at"])

    if refund:
        Subscription.objects.filter(pk=booking.subscription_id).update(
            sessions_remaining=F("sessions_remaining") + 1
        )
        subscription = Subscription.objects.get(pk=booking.subscription_id)
        student = booking.student
        if student.active_subscription_id == subscription.pk:
            student.sessions_remaining = subscription.sessions_remaining
            student.save(update_fields=["sessions_remaining", "updated_at"])

    if is_override and admin is not None:
        AdminAction.objects.create(
            admin=admin,
            action_type=AdminActionType.BOOKING_CANCEL_OVERRIDE,
            target_table=booking._meta.db_table,
            target_id=booking.pk,
            reason="Admin override of automatic 24h credit rule.",
            metadata={"auto_refund": auto_refund, "applied_refund": refund},
        )
    return booking


def has_confirmed_booking(student, topic: Topic) -> bool:
    """True if the student has an upcoming/completed booking for this topic (§2.5)."""
    return Booking.objects.filter(
        student=student,
        topic=topic,
        status__in=[BookingStatus.UPCOMING, BookingStatus.COMPLETED],
    ).exists()


def get_topic_for_student(student, topic: Topic) -> dict:
    """
    §2.5 visibility gate. Pre-booking returns preview (description + sample
    prompts). Only after a confirmed booking are the full approved questions and
    vocabulary returned. Unapproved questions are never returned in either mode.
    """
    base = {
        "id": str(topic.pk),
        "title": topic.title,
        "level": topic.level,
        "description": topic.description,
        "sample_prompts": topic.sample_prompts,
        "subtopics": list(topic.subtopics.values("id", "title", "ai_generated")),
    }

    if not has_confirmed_booking(student, topic):
        base["mode"] = "preview"
        return base

    base["mode"] = "full"
    base["vocabulary"] = topic.vocabulary
    base["questions"] = list(
        topic.questions.filter(approved=True)
        .order_by("sort_order")
        .values("id", "text", "ai_assisted")
    )
    return base
