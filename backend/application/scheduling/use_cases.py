"""
Scheduling use cases.

Orchestrate over apps.scheduling.services (which holds the transactional booking
logic and enforces the booking rules) plus repositories for reads. Use cases add
the permission boundary and DTO mapping.

Rules enforced (in the service, surfaced here):
  - no booking without an active approved subscription
  - no booking on an expired subscription
  - sessions_remaining > 0 (decrement floor)
  - no double booking
  - 24h cancellation credit rule
  - question preview vs full-question gating
"""
from apps.common.enums import UserRole
from apps.scheduling import services as scheduling_services
from application.permissions import (
    ensure_admin,
    ensure_student_owns,
    get_student_profile,
)
from domain import events as domain_events
from domain.dtos import (
    BookingResult,
    CancellationResult,
    SlotDTO,
    TopicAccessResult,
)
from infrastructure.container import (
    default_booking_repository,
    default_event_bus,
    default_subscription_repository,
    default_topic_repository,
)


class RateSessionUseCase:
    """A student rates their completed session (drives the instructor's rating)."""

    def execute(self, *, actor, booking_id, stars, comment=""):
        student = get_student_profile(actor)
        rating = scheduling_services.rate_booking(student, booking_id, stars=stars, comment=comment)
        return {"bookingId": str(rating.booking_id), "stars": rating.stars, "comment": rating.comment}


class JoinGroupSessionUseCase:
    """A student reserves a seat in an upcoming group session."""

    def execute(self, *, actor, group_session_id):
        student = get_student_profile(actor)
        gs = scheduling_services.join_group_session(student, group_session_id)
        return {"groupSessionId": str(gs.id), "joined": True}


class LeaveGroupSessionUseCase:
    """A student releases their seat in a group session."""

    def execute(self, *, actor, group_session_id):
        student = get_student_profile(actor)
        gs = scheduling_services.leave_group_session(student, group_session_id)
        return {"groupSessionId": str(gs.id), "joined": False}


class CreateBookingUseCase:
    def __init__(self, *, bookings=None, topics=None, events=None):
        self.bookings = bookings or default_booking_repository()
        self.topics = topics or default_topic_repository()
        self.events = events or default_event_bus()

    def execute(self, *, actor, topic_id, slot_id) -> BookingResult:
        student = get_student_profile(actor)
        topic = self.topics.get(topic_id)
        slot = self.bookings.get_slot(slot_id)

        booking = scheduling_services.create_booking(student, topic, slot)

        self.events.publish(
            domain_events.BookingCreated(
                booking_id=str(booking.id),
                student_id=str(student.id),
                slot_id=str(slot.id),
            )
        )
        return BookingResult(
            booking_id=str(booking.id),
            slot_id=str(slot.id),
            topic_id=str(topic.id),
            scheduled_at=booking.scheduled_at,
            status=booking.status,
            sessions_remaining=booking.subscription.sessions_remaining,
        )


class CancelBookingUseCase:
    def __init__(self, *, bookings=None, subscriptions=None, events=None):
        self.bookings = bookings or default_booking_repository()
        self.subscriptions = subscriptions or default_subscription_repository()
        self.events = events or default_event_bus()

    def execute(self, *, actor, booking_id, now=None, force_credit=None) -> CancellationResult:
        booking = self.bookings.get(booking_id)
        is_admin = actor is not None and getattr(actor, "role", None) == UserRole.ADMIN
        is_instructor_owner = (
            actor is not None
            and getattr(actor, "role", None) == UserRole.INSTRUCTOR
            and getattr(booking.instructor, "user_id", None) == actor.id
        )

        # Overriding the automatic 24h rule is an admin-only action.
        if force_credit is not None and not is_admin:
            ensure_admin(actor)
        # Admin, the booking's own instructor, or the student may cancel.
        if not is_admin and not is_instructor_owner:
            ensure_student_owns(actor, booking.student)

        cancelled = scheduling_services.cancel_booking(
            booking, now=now, admin=actor if is_admin else None, force_credit=force_credit
        )

        subscription = self.subscriptions.get(cancelled.subscription_id)
        self.events.publish(
            domain_events.BookingCancelled(
                booking_id=str(cancelled.id),
                student_id=str(cancelled.student_id),
                credit_refunded=cancelled.credit_refunded,
            )
        )
        return CancellationResult(
            booking_id=str(cancelled.id),
            status=cancelled.status,
            credit_refunded=cancelled.credit_refunded,
            sessions_remaining=subscription.sessions_remaining,
        )


class RescheduleBookingUseCase:
    """An instructor (or admin) moves one of their upcoming bookings to another
    of their OPEN slots. Notifies the student."""

    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor, booking_id, new_slot_id) -> dict:
        from application.permissions import get_instructor_profile
        from domain.exceptions import PermissionDenied

        booking = self.bookings.get(booking_id)
        is_admin = getattr(actor, "role", None) == UserRole.ADMIN
        if not is_admin:
            instructor = get_instructor_profile(actor)
            if booking.instructor_id != instructor.id:
                raise PermissionDenied("You can only reschedule your own bookings.")
        b = scheduling_services.reschedule_booking(booking, new_slot_id=new_slot_id)
        return {"bookingId": str(b.pk), "scheduledAt": b.scheduled_at.isoformat(), "slotId": str(b.slot_id)}


class GetTopicForStudentUseCase:
    def __init__(self, *, topics=None):
        self.topics = topics or default_topic_repository()

    def execute(self, *, actor, topic_id) -> TopicAccessResult:
        student = get_student_profile(actor)
        topic = self.topics.get(topic_id)
        data = scheduling_services.get_topic_for_student(student, topic)
        return TopicAccessResult(
            topic_id=data["id"],
            mode=data["mode"],
            title=data["title"],
            level=data["level"],
            description=data["description"],
            sample_prompts=data["sample_prompts"],
            subtopics=data["subtopics"],
            questions=data.get("questions"),
            vocabulary=data.get("vocabulary"),
        )


class ListAvailableSlotsUseCase:
    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor, instructor_id) -> list:
        # Browsing to book is a student action.
        get_student_profile(actor)
        slots = self.bookings.list_open_slots(instructor_id)
        return [
            SlotDTO(
                slot_id=str(s.id),
                instructor_id=str(s.instructor_id),
                start_at=s.start_at,
                duration_minutes=s.duration_minutes,
                status=s.status,
            )
            for s in slots
        ]


# ── Recurring weekly schedule ─────────────────────────────────────────────────
def _fmt_time(t):
    return t.strftime("%H:%M")


def schedule_pick_dto(pick) -> dict:
    """Serialise one StudentScheduleSlot to a camelCase dict."""
    return {
        "id": str(pick.id),
        "weekday": pick.weekday,
        "startTime": _fmt_time(pick.start_time),
        "durationMinutes": pick.duration_minutes,
        "topicId": str(pick.topic_id) if pick.topic_id else None,
        "topicTitle": pick.topic.title if pick.topic_id else None,
        "instructorId": str(pick.instructor_id) if pick.instructor_id else None,
        "instructorName": pick.instructor.user.full_name if pick.instructor_id else None,
        "reviewStatus": pick.review_status,
        "reviewNote": pick.review_note or "",
        "reviewedAt": pick.reviewed_at.isoformat() if pick.reviewed_at else None,
    }


def _generated_summary(result) -> dict:
    return {
        "created": len(result["created"]),
        "skipped": len(result["skipped"]),
        "outOfCredits": result["out_of_credits"],
        "bookings": [
            {
                "bookingId": str(b.id),
                "topicTitle": b.topic_title,
                "scheduledAt": b.scheduled_at.isoformat(),
                "status": b.status,
            }
            for b in result["created"]
        ],
    }


class SetStudentScheduleUseCase:
    """Save the student's recurring weekly schedule as picks awaiting admin review.
    New/edited picks are PENDING and are NOT booked until an admin approves them;
    already-approved, unchanged picks still materialise their upcoming bookings.
    Returns the saved schedule, a summary of any bookings generated (from approved
    picks), and the number of picks now awaiting review."""

    def execute(self, *, actor, picks) -> dict:
        from apps.common.enums import ScheduleReviewStatus

        student = get_student_profile(actor)
        saved = scheduling_services.set_student_schedule(student, picks)
        # Approved, unchanged picks may still have new upcoming occurrences to book.
        generated = scheduling_services.generate_bookings_from_schedule(student)
        pending = [p for p in saved if p.review_status == ScheduleReviewStatus.PENDING]
        if pending:
            scheduling_services.notify_admins_of_schedule_submission(
                student, pending_count=len(pending)
            )
        return {
            "schedule": [schedule_pick_dto(p) for p in saved],
            "generated": _generated_summary(generated),
            "pendingReview": len(pending),
        }


class GenerateScheduleBookingsUseCase:
    """Materialise upcoming bookings from the student's existing schedule (idempotent).
    Intended for on-demand refresh and for a periodic rolling job."""

    def execute(self, *, actor) -> dict:
        student = get_student_profile(actor)
        generated = scheduling_services.generate_bookings_from_schedule(student)
        return _generated_summary(generated)


class SetRecurringAvailabilityUseCase:
    """An instructor replaces their recurring weekly availability windows."""

    def execute(self, *, actor, windows) -> list:
        from application.permissions import get_instructor_profile

        instructor = get_instructor_profile(actor)
        saved = scheduling_services.set_instructor_recurring_availability(
            instructor, windows, actor=actor
        )
        return [
            {
                "id": str(w.id),
                "weekday": w.weekday,
                "startTime": _fmt_time(w.start_time),
                "endTime": _fmt_time(w.end_time),
            }
            for w in saved
        ]


# ── Admin review gate for student recurring schedules ─────────────────────────

class ListScheduleRequestsUseCase:
    """Admin: pending student picks awaiting review, grouped by student."""

    def execute(self, *, actor) -> list:
        ensure_admin(actor)
        slots = scheduling_services.list_pending_schedule_slots()
        by_student = {}
        # Cache candidates per (weekday, time) so a busy queue doesn't re-scan.
        cand_cache = {}
        for s in slots:
            key = str(s.student_id)
            g = by_student.get(key)
            if g is None:
                g = {
                    "studentId": key,
                    "studentName": s.student.user.full_name,
                    "studentEmail": s.student.user.email,
                    "picks": [],
                }
                by_student[key] = g
            ck = (s.weekday, s.start_time)
            if ck not in cand_cache:
                cand_cache[ck] = [
                    {"id": str(i.id), "name": i.user.full_name}
                    for i in scheduling_services.available_instructors_at(s.weekday, s.start_time)
                ]
            pick = schedule_pick_dto(s)
            pick["instructorCandidates"] = cand_cache[ck]
            g["picks"].append(pick)
        return list(by_student.values())


class ApproveStudentScheduleUseCase:
    """Admin: approve a student's pending picks (all, or specific slot ids) and
    materialise their bookings."""

    def execute(self, *, actor, student_id, slot_ids=None) -> dict:
        from apps.accounts.models import StudentProfile

        ensure_admin(actor)
        student = StudentProfile.objects.select_related("user").get(pk=student_id)
        result = scheduling_services.approve_student_schedule(
            student, actor=actor, slot_ids=slot_ids
        )
        return {
            "approved": len(result["approved"]),
            "generated": _generated_summary(result["generated"]),
        }


class RejectScheduleSlotUseCase:
    """Admin: reject a single pending pick with an optional note."""

    def execute(self, *, actor, slot_id, note="") -> dict:
        from apps.scheduling.models import StudentScheduleSlot

        ensure_admin(actor)
        slot = StudentScheduleSlot.objects.select_related(
            "student", "student__user", "topic", "instructor", "instructor__user"
        ).get(pk=slot_id)
        scheduling_services.reject_schedule_slot(slot, actor=actor, note=note)
        return schedule_pick_dto(slot)


class AssignScheduleSlotInstructorUseCase:
    """Admin: assign (or re-assign) the instructor on a pending pick."""

    def execute(self, *, actor, slot_id, instructor_id) -> dict:
        from apps.scheduling.models import StudentScheduleSlot
        from apps.accounts.models import InstructorProfile

        ensure_admin(actor)
        slot = StudentScheduleSlot.objects.select_related(
            "student", "topic", "instructor", "instructor__user"
        ).get(pk=slot_id)
        instructor = InstructorProfile.objects.select_related("user").get(pk=instructor_id)
        scheduling_services.assign_schedule_slot_instructor(slot, instructor=instructor, actor=actor)
        slot.refresh_from_db()
        return schedule_pick_dto(slot)


# ── Instructor: per-session lesson authoring ──────────────────────────────────

class ListInstructorUpcomingSessionsUseCase:
    """The instructor's upcoming sessions with lesson-authoring fields."""

    def execute(self, *, actor) -> list:
        from application.permissions import get_instructor_profile
        from apps.scheduling.models import Booking
        from apps.common.enums import BookingStatus

        instructor = get_instructor_profile(actor)
        bookings = (
            Booking.objects.select_related("student", "student__user")
            .filter(instructor=instructor, status=BookingStatus.UPCOMING, deleted_at__isnull=True)
            .order_by("scheduled_at")
        )
        return [
            {
                "bookingId": str(b.id),
                "studentName": b.student.user.full_name,
                "scheduledAt": b.scheduled_at.isoformat(),
                "durationMinutes": b.duration_minutes,
                "lessonTitle": b.lesson_title or "",
                "lessonQuestions": b.lesson_questions or [],
                "lessonPrepared": b.lesson_prepared_at is not None,
            }
            for b in bookings
        ]


class SuggestLessonQuestionsUseCase:
    """AI-assisted: suggest discussion questions from a free-form lesson title.
    Returns strings only (nothing persisted) for the instructor to edit/keep. Uses
    the same AI provider as the topic builder, which falls back to a deterministic
    stub when OpenAI isn't configured — so it always returns something usable."""

    def execute(self, *, actor, title) -> dict:
        from application.permissions import get_instructor_profile
        from infrastructure.container import default_ai_provider

        get_instructor_profile(actor)  # instructors only
        title = (title or "").strip()
        if not title:
            return {"questions": []}
        ai = default_ai_provider()
        qs = ai.generate_questions(topic_title=title, topic_description="")
        return {"questions": [q.strip() for q in qs if isinstance(q, str) and q.strip()][:8]}


class PrepareLessonUseCase:
    """Instructor writes/updates the lesson (title + questions) for one session."""

    def execute(self, *, actor, booking_id, title, questions) -> dict:
        from application.permissions import get_instructor_profile
        from apps.scheduling.models import Booking

        instructor = get_instructor_profile(actor)
        booking = Booking.objects.get(pk=booking_id)
        scheduling_services.set_booking_lesson(
            booking, instructor=instructor, title=title, questions=questions
        )
        return {
            "bookingId": str(booking.id),
            "lessonTitle": booking.lesson_title,
            "lessonQuestions": booking.lesson_questions,
            "lessonPrepared": True,
        }
