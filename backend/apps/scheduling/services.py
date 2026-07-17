"""
Scheduling business-rule services.

Encodes: §2.1 no double booking, §2.3 sessions ≥ 0, §2.4 expired subscription
blocks booking, Business Rule 8 cancellation credit window, and §2.5 question
visibility gate.
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.admin_ops.models import AdminAction
from apps.common.enums import (
    AdminActionType,
    BookingStatus,
    GroupSessionStatus,
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
    is_covered_by_intervals,
)

from .models import (
    AvailabilityException,
    AvailabilitySlot,
    Booking,
    GroupSession,
    GroupSessionAttendee,
    Question,
    SessionRating,
    Topic,
)


def list_availability_exceptions(instructor):
    return list(AvailabilityException.objects.filter(instructor=instructor).order_by("start_at"))


def add_availability_exception(instructor, *, kind, start_at, end_at, note=""):
    if end_at <= start_at:
        raise BusinessRuleError("End must be after the start.", code="invalid_exception_range")
    return AvailabilityException.objects.create(
        instructor=instructor, kind=kind, start_at=start_at, end_at=end_at, note=(note or "").strip()
    )


def remove_availability_exception(instructor, exception_id):
    exc = AvailabilityException.objects.filter(pk=exception_id, instructor=instructor).first()
    if exc is None:
        raise BusinessRuleError("Exception not found.", code="exception_not_found")
    exc.delete()
    return exception_id


def exception_intervals(instructor_id):
    """Half-open [start, end) intervals during which the instructor is unavailable."""
    return [
        (e.start_at, e.end_at)
        for e in AvailabilityException.objects.filter(instructor_id=instructor_id).only("start_at", "end_at")
    ]


def list_upcoming_group_sessions():
    """Scheduled group sessions in the future, soonest first, with attendees
    prefetched for seat counting and roster display."""
    return list(
        GroupSession.objects.filter(
            status=GroupSessionStatus.SCHEDULED,
            start_at__gte=timezone.now(),
            deleted_at__isnull=True,
        )
        .prefetch_related("attendees__student__user")
        .order_by("start_at")
    )


@transaction.atomic
def join_group_session(student, group_session_id):
    """Reserve the student a seat. Idempotent per (session, student); rejects a
    full or already-started session. Returns the GroupSession."""
    gs = (
        GroupSession.objects.select_for_update()
        .filter(pk=group_session_id, deleted_at__isnull=True)
        .first()
    )
    if gs is None:
        raise BusinessRuleError("Group session not found.", code="group_session_not_found")
    if gs.status != GroupSessionStatus.SCHEDULED or gs.start_at < timezone.now():
        raise BusinessRuleError("This session is no longer open to join.", code="group_session_closed")

    already = GroupSessionAttendee.objects.filter(group_session=gs, student=student).exists()
    if not already:
        if gs.attendees.count() >= gs.capacity:
            raise BusinessRuleError("This session is full.", code="group_session_full")
        GroupSessionAttendee.objects.create(group_session=gs, student=student)
    return gs


@transaction.atomic
def leave_group_session(student, group_session_id):
    """Release the student's seat (idempotent). Returns the GroupSession."""
    gs = GroupSession.objects.filter(pk=group_session_id, deleted_at__isnull=True).first()
    if gs is None:
        raise BusinessRuleError("Group session not found.", code="group_session_not_found")
    GroupSessionAttendee.objects.filter(group_session=gs, student=student).delete()
    return gs


@transaction.atomic
def rate_booking(student, booking_id, *, stars, comment=""):
    """A student rates their own COMPLETED session. Upserts one rating per booking
    and recomputes the instructor's aggregate rating. Returns the SessionRating."""
    from django.db.models import Avg
    from decimal import Decimal, ROUND_HALF_UP

    if stars is None or not (1 <= int(stars) <= 5):
        raise BusinessRuleError("Rating must be between 1 and 5.", code="invalid_rating")

    booking = (
        Booking.objects.select_related("instructor")
        .filter(pk=booking_id, student=student)
        .first()
    )
    if booking is None:
        raise BusinessRuleError("Booking not found.", code="booking_not_found")
    if booking.status != BookingStatus.COMPLETED:
        raise BusinessRuleError("You can only rate a completed session.", code="session_not_completed")

    rating, _ = SessionRating.objects.update_or_create(
        booking=booking,
        defaults={
            "student": student,
            "instructor": booking.instructor,
            "stars": int(stars),
            "comment": (comment or "").strip(),
        },
    )

    # Recompute the instructor's aggregate rating (avg of all their ratings).
    agg = SessionRating.objects.filter(instructor=booking.instructor).aggregate(avg=Avg("stars"))
    avg = agg["avg"] or 0
    instructor = booking.instructor
    instructor.rating = Decimal(str(avg)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    instructor.save(update_fields=["rating", "updated_at"])
    return rating


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

    # A slot that has already PASSED can't be booked (it would be born "Missed").
    # A grace window keeps a session that is starting now / just started bookable
    # (it's still joinable) — only clearly-past slots are rejected.
    from datetime import timedelta
    if slot.start_at < timezone.now() - timedelta(minutes=slot.duration_minutes or 45):
        raise BusinessRuleError(
            "That time has already passed. Please pick a later slot.", code="slot_unavailable"
        )

    if slot.instructor_id != topic.instructor_id:
        raise BusinessRuleError(
            "Slot does not belong to the topic's instructor.", code="slot_instructor_mismatch"
        )

    # The instructor may have blocked this time (vacation / holiday / block).
    if is_covered_by_intervals(slot.start_at, exception_intervals(slot.instructor_id)):
        raise BusinessRuleError(
            "The instructor is unavailable at that time.", code="instructor_unavailable"
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
    # Notify the instructor of the new booking on their calendar.
    Notification.objects.create(
        user=booking.instructor.user,
        type=NotificationType.NEW_BOOKING,
        title="New booking",
        body=f"{student.user.full_name} booked {topic.title} on {slot.start_at:%b %d, %H:%M}.",
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

    # Notify both parties of the cancellation.
    _body = f"{booking.topic_title} on {booking.scheduled_at:%b %d, %H:%M} was cancelled."
    for recipient in (booking.student.user, booking.instructor.user):
        Notification.objects.create(
            user=recipient,
            type=NotificationType.BOOKING_CANCELLED,
            title="Booking cancelled",
            body=_body,
            data={"booking_id": str(booking.pk)},
        )
    return booking


@transaction.atomic
def reschedule_booking(booking: Booking, *, new_slot_id, now=None) -> Booking:
    """Move an upcoming booking to another OPEN slot of the same instructor. The
    old slot is released, the new one booked, and the student is notified."""
    now = now or timezone.now()
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status != BookingStatus.UPCOMING:
        raise InvalidStateTransition("Only an upcoming booking can be rescheduled.")

    new_slot = AvailabilitySlot.objects.select_for_update().filter(pk=new_slot_id).first()
    if new_slot is None:
        raise BusinessRuleError("Slot not found.", code="slot_unavailable")
    if new_slot.instructor_id != booking.instructor_id:
        raise BusinessRuleError("Slot belongs to another instructor.", code="slot_instructor_mismatch")
    if new_slot.status != SlotStatus.OPEN:
        raise SlotAlreadyBooked()
    if new_slot.start_at < now - timedelta(minutes=new_slot.duration_minutes or 45):
        raise BusinessRuleError("That time has already passed.", code="slot_unavailable")
    if is_covered_by_intervals(new_slot.start_at, exception_intervals(new_slot.instructor_id)):
        raise BusinessRuleError("The instructor is unavailable at that time.", code="instructor_unavailable")

    old = booking.slot
    old.status = SlotStatus.OPEN
    old.save(update_fields=["status", "updated_at"])
    new_slot.status = SlotStatus.BOOKED
    new_slot.save(update_fields=["status", "updated_at"])
    booking.slot = new_slot
    booking.scheduled_at = new_slot.start_at
    booking.save(update_fields=["slot", "scheduled_at", "updated_at"])

    Notification.objects.create(
        user=booking.student.user,
        type=NotificationType.BOOKING_CONFIRMED,
        title="Session rescheduled",
        body=f"{booking.topic_title} moved to {new_slot.start_at:%b %d, %H:%M}.",
        data={"booking_id": str(booking.pk)},
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
