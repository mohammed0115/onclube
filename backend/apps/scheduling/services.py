"""
Scheduling business-rule services.

Encodes: §2.1 no double booking, §2.3 sessions ≥ 0, §2.4 expired subscription
blocks booking, Business Rule 8 cancellation credit window, and §2.5 question
visibility gate.
"""
from datetime import datetime, timedelta

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
    time_within_windows,
    upcoming_dates_for_weekday,
)

from .models import (
    AvailabilityException,
    AvailabilitySlot,
    Booking,
    GroupSession,
    GroupSessionAttendee,
    Question,
    RecurringAvailability,
    SessionRating,
    StudentScheduleSlot,
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


# ── Recurring weekly schedule (student-driven) ────────────────────────────────
#
# The student builds their OWN recurring weekly timetable: for each pick they
# choose a weekday, a time and a topic (which carries its instructor). Those picks
# are only valid inside the instructor's recurring availability windows. The
# system then materialises concrete Bookings for the coming weeks from the active
# picks, reusing `create_booking` so credits, notifications, live-session rooms and
# reports all keep working unchanged.

# How many weeks ahead each active pick is materialised into real bookings.
SCHEDULE_HORIZON_WEEKS = 2


def _hm(t):
    """(hour, minute) key so times compare without seconds/microseconds noise."""
    return (t.hour, t.minute)


def list_instructor_recurring_availability(instructor):
    """The instructor's recurring weekly windows, ordered for display."""
    return list_instructor_recurring_availability_by_id(instructor.pk)


def list_instructor_recurring_availability_by_id(instructor_id):
    """The recurring weekly windows for an instructor id, ordered for display."""
    if not instructor_id:
        return []
    return list(
        RecurringAvailability.objects.filter(instructor_id=instructor_id).order_by(
            "weekday", "start_time"
        )
    )


def instructor_windows_by_weekday(instructor_id):
    """{weekday: [(start_time, end_time), …]} for a given instructor."""
    out = {}
    for w in RecurringAvailability.objects.filter(instructor_id=instructor_id).only(
        "weekday", "start_time", "end_time"
    ):
        out.setdefault(w.weekday, []).append((w.start_time, w.end_time))
    return out


@transaction.atomic
def set_instructor_recurring_availability(instructor, windows, *, actor=None):
    """Replace the instructor's recurring windows with the desired set. Each window
    is a dict {weekday, start_time, end_time}. Idempotent (full replace)."""
    seen = set()
    cleaned = []
    for w in windows:
        weekday = int(w["weekday"])
        start = w["start_time"]
        end = w["end_time"]
        if not (0 <= weekday <= 6):
            raise BusinessRuleError("weekday must be 0..6.", code="invalid_weekday")
        if end <= start:
            raise BusinessRuleError("End must be after start.", code="invalid_window_range")
        key = (weekday, _hm(start))
        if key in seen:
            continue  # collapse duplicates on the same (weekday, start)
        seen.add(key)
        cleaned.append((weekday, start, end))

    RecurringAvailability.objects.filter(instructor=instructor).delete()
    RecurringAvailability.objects.bulk_create(
        [
            RecurringAvailability(
                instructor=instructor,
                weekday=weekday,
                start_time=start,
                end_time=end,
                created_by=actor,
                updated_by=actor,
            )
            for (weekday, start, end) in cleaned
        ]
    )
    return list_instructor_recurring_availability(instructor)


def match_instructors_for(weekday, start_time):
    """Instructors available at a given weekday + time — the foundation for
    time-first matching (Product Bible stage 9): the student picks a time and the
    system offers whoever can teach it. An instructor qualifies when they have at
    least one published topic AND their recurring availability covers the time (an
    instructor with no windows at all counts as available all week). Returns
    lightweight candidate dicts ordered by name."""
    from apps.accounts.models import InstructorProfile

    weekday = int(weekday)
    candidates = []
    instructors = (
        InstructorProfile.objects.select_related("user")
        .prefetch_related("topics", "recurring_availability")
    )
    for ins in instructors:
        published = [t for t in ins.topics.all() if t.published and t.deleted_at is None]
        if not published:
            continue
        all_windows = list(ins.recurring_availability.all())
        windows = [(w.start_time, w.end_time) for w in all_windows if w.weekday == weekday]
        if all_windows and not time_within_windows(start_time, windows):
            continue
        candidates.append(
            {
                "instructorId": str(ins.id),
                "instructorName": ins.user.full_name,
                "topicCount": len(published),
            }
        )
    candidates.sort(key=lambda c: c["instructorName"])
    return candidates


def list_student_schedule(student):
    """The student's active recurring picks, ordered weekday→time."""
    return list(
        StudentScheduleSlot.objects.filter(
            student=student, active=True, deleted_at__isnull=True
        )
        .select_related("topic", "instructor", "instructor__user")
        .order_by("weekday", "start_time")
    )


def _validate_pick(student, pick):
    """Validate one desired pick and resolve its topic/instructor. Returns a dict
    ready to persist. Raises BusinessRuleError on any invalid pick."""
    weekday = int(pick["weekday"])
    start_time = pick["start_time"]
    duration = int(pick.get("duration_minutes") or 45)
    topic_id = pick["topic_id"]

    if not (0 <= weekday <= 6):
        raise BusinessRuleError("weekday must be 0..6.", code="invalid_weekday")
    if duration <= 0:
        raise BusinessRuleError("Duration must be positive.", code="invalid_duration")

    topic = (
        Topic.objects.select_related("instructor")
        .filter(pk=topic_id, published=True, deleted_at__isnull=True)
        .first()
    )
    if topic is None:
        raise BusinessRuleError("Topic not found or not published.", code="topic_not_found")

    windows = [
        (w.start_time, w.end_time)
        for w in RecurringAvailability.objects.filter(
            instructor_id=topic.instructor_id, weekday=weekday
        ).only("start_time", "end_time")
    ]
    # An instructor with *no* windows at all is treated as available all week.
    has_any_window = RecurringAvailability.objects.filter(
        instructor_id=topic.instructor_id
    ).exists()
    if has_any_window and not time_within_windows(start_time, windows):
        raise BusinessRuleError(
            "That time is outside the instructor's available hours.",
            code="outside_availability",
        )
    return {
        "weekday": weekday,
        "start_time": start_time,
        "duration_minutes": duration,
        "topic": topic,
        "instructor": topic.instructor,
    }


@transaction.atomic
def set_student_schedule(student, picks):
    """Upsert the student's recurring weekly schedule from `picks`. Each pick is a
    dict {weekday, start_time, topic_id, duration_minutes?}. Picks removed from the
    desired set are deactivated (their already-generated bookings are preserved).
    Returns the active pick rows. Does NOT itself generate bookings — the caller
    runs `generate_bookings_from_schedule` after."""
    validated = [_validate_pick(student, p) for p in picks]

    existing = {
        (s.weekday, _hm(s.start_time)): s
        for s in StudentScheduleSlot.objects.filter(
            student=student, active=True, deleted_at__isnull=True
        )
    }
    desired_keys = set()
    result = []
    for v in validated:
        key = (v["weekday"], _hm(v["start_time"]))
        if key in desired_keys:
            continue  # a student can't pick the same weekday+time twice
        desired_keys.add(key)
        cur = existing.get(key)
        if cur is None:
            cur = StudentScheduleSlot.objects.create(
                student=student,
                instructor=v["instructor"],
                topic=v["topic"],
                weekday=v["weekday"],
                start_time=v["start_time"],
                duration_minutes=v["duration_minutes"],
                active=True,
            )
        else:
            fields = []
            if cur.topic_id != v["topic"].id:
                cur.topic = v["topic"]
                fields.append("topic")
            if cur.instructor_id != v["instructor"].id:
                cur.instructor = v["instructor"]
                fields.append("instructor")
            if cur.duration_minutes != v["duration_minutes"]:
                cur.duration_minutes = v["duration_minutes"]
                fields.append("duration_minutes")
            if fields:
                fields.append("updated_at")
                cur.save(update_fields=fields)
        result.append(cur)

    for key, s in existing.items():
        if key not in desired_keys:
            s.active = False
            s.save(update_fields=["active", "updated_at"])

    return result


def generate_bookings_from_schedule(student, *, horizon_weeks=SCHEDULE_HORIZON_WEEKS, now=None):
    """Materialise concrete Bookings from the student's active recurring picks for
    the next `horizon_weeks` occurrences of each pick.

    Reuses `create_booking`, so every generated booking consumes exactly one
    session credit and gets its live-session room + notifications. Generation is
    idempotent (an occurrence that already has a live booking is skipped) and stops
    cleanly the moment the student runs out of credits. Returns a summary dict."""
    now = now or timezone.now()
    tz = timezone.get_current_timezone()
    ref_date = timezone.localtime(now).date()

    picks = list_student_schedule(student)
    created = []
    skipped = []
    out_of_credits = False

    for pick in picks:
        if out_of_credits:
            break
        dates = upcoming_dates_for_weekday(
            weekday=pick.weekday, reference=ref_date, count=horizon_weeks, include_today=True
        )
        for d in dates:
            naive = datetime.combine(d, pick.start_time)
            start_at = timezone.make_aware(naive, tz)
            if start_at < now:
                continue  # occurrence already in the past

            already = (
                Booking.objects.filter(schedule_slot=pick, scheduled_at=start_at)
                .exclude(status=BookingStatus.CANCELLED)
                .exists()
            )
            if already:
                continue

            if is_covered_by_intervals(start_at, exception_intervals(pick.instructor_id)):
                skipped.append({"pick_id": str(pick.id), "start_at": start_at, "reason": "instructor_unavailable"})
                continue

            slot, _ = AvailabilitySlot.objects.get_or_create(
                instructor=pick.instructor,
                start_at=start_at,
                defaults={"duration_minutes": pick.duration_minutes, "status": SlotStatus.OPEN},
            )
            if slot.status == SlotStatus.BOOKED:
                skipped.append({"pick_id": str(pick.id), "start_at": start_at, "reason": "slot_taken"})
                continue

            try:
                booking = create_booking(student, pick.topic, slot)
            except InsufficientSessionCredits:
                skipped.append({"pick_id": str(pick.id), "start_at": start_at, "reason": "no_credits"})
                out_of_credits = True
                break
            except (SlotAlreadyBooked, NoActiveSubscription, SubscriptionExpired, BusinessRuleError) as exc:
                skipped.append({"pick_id": str(pick.id), "start_at": start_at, "reason": getattr(exc, "code", "unavailable")})
                continue

            booking.schedule_slot = pick
            booking.save(update_fields=["schedule_slot", "updated_at"])
            created.append(booking)

    return {"created": created, "skipped": skipped, "out_of_credits": out_of_credits}
