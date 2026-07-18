"""
Scheduling query use cases (read-only).

All enforce ownership/role via the permission boundary and return DTOs only.
The full-question gate (§2.5) lives in GetTopicPreviewOrFullUseCase /
GetQuestionsForBookingUseCase.
"""
from datetime import datetime, time, timedelta

from django.utils import timezone

from apps.common.enums import BookingStatus
from application import mappers
from application.permissions import (
    ensure_admin,
    ensure_booking_viewer,
    get_instructor_profile,
    get_student_profile,
)
from domain.dtos import (
    CalendarDayResult,
    CalendarSlotResult,
    InstructorDashboardResult,
    StudentDashboardResult,
    TopicFullResult,
    TopicPreviewResult,
    WeeklyCalendarResult,
)
from domain.exceptions import QuestionsNotAvailable
from domain.rules import scheduling as sched_rules
from infrastructure.container import (
    default_ai_report_repository,
    default_booking_repository,
    default_question_repository,
    default_topic_repository,
)


class GetWeeklyCalendarUseCase:
    """Weekly (Mon–Sun) calendar of a topic's instructor slots. Each slot is
    presented as available / booked / blocked / completed — only `available` is
    selectable. Read-only; no booking side effects."""

    def __init__(self, *, topics=None, bookings=None):
        self.topics = topics or default_topic_repository()
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor, topic_id, week_start=None, now=None) -> WeeklyCalendarResult:
        get_student_profile(actor)  # student action
        topic = self.topics.get(topic_id)
        now = now or timezone.now()
        ws = week_start or sched_rules.week_start_for(now)  # Monday (date)

        start_dt = timezone.make_aware(datetime.combine(ws, time.min))
        end_dt = timezone.make_aware(datetime.combine(ws + timedelta(days=7), time.min))
        slots = self.bookings.list_slots_in_range(topic.instructor_id, start_dt, end_dt)

        by_day = {}
        for s in slots:
            by_day.setdefault(s.start_at.date(), []).append(s)

        days = []
        for i in range(7):
            d = ws + timedelta(days=i)
            day_slots = tuple(
                CalendarSlotResult(
                    id=str(s.id),
                    start_at=s.start_at,
                    duration_minutes=s.duration_minutes,
                    status=sched_rules.calendar_slot_status(
                        slot_status=s.status, start_at=s.start_at, now=now
                    ),
                )
                for s in by_day.get(d, [])
            )
            days.append(
                CalendarDayResult(date=d, weekday=sched_rules.WEEKDAY_NAMES[i], slots=day_slots)
            )

        return WeeklyCalendarResult(
            topic_id=str(topic.id),
            instructor_id=str(topic.instructor_id),
            instructor_name=topic.instructor.user.full_name,
            week_start=ws,
            week_end=ws + timedelta(days=6),
            days=tuple(days),
        )


class ListAdminBookingsUseCase:
    """All bookings (admin), newest first. Cancelled bookings are preserved."""

    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor) -> list:
        ensure_admin(actor)
        return [mappers.admin_booking_item(b) for b in self.bookings.list_all()]


# ── Student ───────────────────────────────────────────────────────────────────
class ListStudentBookingsUseCase:
    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor) -> list:
        student = get_student_profile(actor)
        return [mappers.booking_list_item(b) for b in self.bookings.list_for_student(student)]


class GetBookingDetailUseCase:
    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor, booking_id):
        booking = self.bookings.get(booking_id)
        ensure_booking_viewer(actor, booking)
        return mappers.booking_detail(booking)


class GetPracticeContentUseCase:
    """Study material for the practice hub — vocabulary + practice phrases."""

    def __init__(self, *, topics=None):
        self.topics = topics or default_topic_repository()

    def execute(self, *, actor) -> dict:
        get_student_profile(actor)  # student-only
        return self.topics.practice_content()


class ListCommunitySessionsUseCase:
    """Upcoming group/community sessions a student can browse and join."""

    def execute(self, *, actor) -> list:
        from apps.scheduling import services

        student = get_student_profile(actor)
        sessions = services.list_upcoming_group_sessions()
        return [mappers.group_session(gs, student_id=student.id) for gs in sessions]


class ListStudentAvailableTopicsUseCase:
    def __init__(self, *, topics=None):
        self.topics = topics or default_topic_repository()

    def execute(self, *, actor, category=None) -> list:
        get_student_profile(actor)
        return [mappers.topic_preview(t) for t in self.topics.list_published(category=category)]


class GetTopicPreviewOrFullUseCase:
    """Preview before a confirmed booking; full approved questions after (§2.5)."""

    def __init__(self, *, topics=None, bookings=None, questions=None):
        self.topics = topics or default_topic_repository()
        self.bookings = bookings or default_booking_repository()
        self.questions = questions or default_question_repository()

    def execute(self, *, actor, topic_id):
        student = get_student_profile(actor)
        topic = self.topics.get(topic_id)
        if self.bookings.has_confirmed_booking(student, topic):
            approved = self.questions.list_approved_for_topic(topic)
            return mappers.topic_full(topic, approved)
        return mappers.topic_preview(topic)


class GetQuestionsForBookingUseCase:
    """Approved questions, only when the student has a confirmed booking (§2.5)."""

    def __init__(self, *, topics=None, bookings=None, questions=None):
        self.topics = topics or default_topic_repository()
        self.bookings = bookings or default_booking_repository()
        self.questions = questions or default_question_repository()

    def execute(self, *, actor, topic_id) -> list:
        student = get_student_profile(actor)
        topic = self.topics.get(topic_id)
        if not self.bookings.has_confirmed_booking(student, topic):
            raise QuestionsNotAvailable()
        return [mappers.question_full(q) for q in self.questions.list_approved_for_topic(topic)]


class GetStudentDashboardUseCase:
    def __init__(self, *, bookings=None, reports=None):
        self.bookings = bookings or default_booking_repository()
        self.reports = reports or default_ai_report_repository()

    def execute(self, *, actor) -> StudentDashboardResult:
        student = get_student_profile(actor)
        bookings = self.bookings.list_for_student(student)  # newest first
        completed = [b for b in bookings if b.status == BookingStatus.COMPLETED]
        upcoming = [b for b in bookings if b.status == BookingStatus.UPCOMING]
        next_b = min(upcoming, key=lambda b: b.scheduled_at, default=None)

        ready_reports = self.reports.list_for_student(student)  # oldest→newest
        latest_score = ready_reports[-1].overall_score if ready_reports else None
        progress = [
            {"label": f"S{i + 1}", "score": r.overall_score}
            for i, r in enumerate(ready_reports)
        ]

        # Gamification (pure, deterministic) — streak, XP, milestone board.
        from domain import gamification as gam
        board = gam.compute(
            sessions_completed=len(completed),
            session_dates=[b.scheduled_at for b in completed],
            has_level=bool(student.level),
            now=timezone.now(),
        )

        return StudentDashboardResult(
            sessions_remaining=student.sessions_remaining,
            sessions_completed=len(completed),
            payment_status=student.payment_status,
            level=student.level,
            latest_score=latest_score,
            next_session=mappers.booking_list_item(next_b) if next_b else None,
            recent_sessions=[mappers.booking_list_item(b) for b in bookings[:5]],
            progress_trend=progress,
            gamification=board,
        )


# ── Instructor ────────────────────────────────────────────────────────────────
class ListInstructorTopicsUseCase:
    def __init__(self, *, topics=None, questions=None):
        self.topics = topics or default_topic_repository()
        self.questions = questions or default_question_repository()

    def execute(self, *, actor) -> list:
        instructor = get_instructor_profile(actor)
        result = []
        for topic in self.topics.list_for_instructor(instructor):
            # Owner sees ALL questions (approved + drafts) on their own topics.
            result.append(mappers.topic_full(topic, self.questions.list_all_for_topic(topic)))
        return result


class ListInstructorBookingsUseCase:
    """The instructor's own bookings (newest first) — for cancel/reschedule."""

    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor) -> list:
        instructor = get_instructor_profile(actor)
        return [mappers.booking_list_item(b) for b in self.bookings.list_for_instructor(instructor)]


def _report_of(booking):
    try:
        return booking.report
    except Exception:
        return None


class ListInstructorStudentsUseCase:
    """Distinct students the instructor has taught, with a quick summary."""

    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor) -> list:
        instructor = get_instructor_profile(actor)
        bookings = self.bookings.list_for_instructor(instructor)  # newest first
        grouped = {}
        for b in bookings:
            g = grouped.setdefault(b.student_id, {"student": b.student, "sessions": 0, "completed": 0, "last_score": None})
            g["sessions"] += 1
            if b.status == BookingStatus.COMPLETED:
                g["completed"] += 1
            if g["last_score"] is None:
                rep = _report_of(b)
                if rep is not None and getattr(rep, "overall_score", None) is not None:
                    g["last_score"] = rep.overall_score
        return [
            {
                "id": str(g["student"].id),
                "fullName": g["student"].user.full_name,
                "level": g["student"].level,
                "sessions": g["sessions"],
                "completed": g["completed"],
                "lastScore": g["last_score"],
            }
            for g in grouped.values()
        ]


class GetInstructorStudentUseCase:
    """Per-student prep view for the instructor: level, goal, sessions, reports."""

    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor, student_id) -> dict:
        from domain.exceptions import PermissionDenied

        instructor = get_instructor_profile(actor)
        mine = [b for b in self.bookings.list_for_instructor(instructor) if str(b.student_id) == str(student_id)]
        if not mine:
            raise PermissionDenied("Not one of your students.")
        s = mine[0].student
        sessions = []
        for b in mine:
            rep = _report_of(b)
            sessions.append({
                "id": str(b.id),
                "topicTitle": b.topic_title,
                "scheduledAt": b.scheduled_at.isoformat(),
                "status": b.status,
                "reportId": str(rep.id) if rep is not None else None,
                "score": getattr(rep, "overall_score", None) if rep is not None else None,
            })
        goal = getattr(s, "goal", None)
        return {
            "id": str(s.id),
            "fullName": s.user.full_name,
            "level": s.level,
            "goalTitle": getattr(goal, "title", None) if goal else None,
            "sessionsRemaining": s.sessions_remaining,
            "paymentStatus": s.payment_status,
            "sessions": sessions,
        }


class ListInstructorAvailabilityUseCase:
    def __init__(self, *, bookings=None):
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor) -> list:
        instructor = get_instructor_profile(actor)
        return [mappers.availability_slot(s) for s in self.bookings.list_all_slots(instructor)]


class GetInstructorDashboardUseCase:
    def __init__(self, *, bookings=None, topics=None):
        self.bookings = bookings or default_booking_repository()
        self.topics = topics or default_topic_repository()

    def execute(self, *, actor) -> InstructorDashboardResult:
        instructor = get_instructor_profile(actor)
        bookings = self.bookings.list_for_instructor(instructor)
        upcoming = [b for b in bookings if b.status == BookingStatus.UPCOMING]
        completed = [b for b in bookings if b.status == BookingStatus.COMPLETED]
        cancelled = [b for b in bookings if b.status == BookingStatus.CANCELLED]
        topics = self.topics.list_for_instructor(instructor)

        teaching_hours = round(sum((b.duration_minutes or 45) for b in completed) / 60, 1)
        total = len(bookings)
        cancellation_rate = round(len(cancelled) / total * 100, 1) if total else 0.0

        return InstructorDashboardResult(
            upcoming_sessions=len(upcoming),
            active_students=len({b.student_id for b in bookings}),
            topics_owned=len(topics),
            average_rating=float(instructor.rating),
            completed_sessions=len(completed),
            teaching_hours=teaching_hours,
            cancellation_rate=cancellation_rate,
            today_sessions=[mappers.booking_list_item(b) for b in upcoming],
            topics=[
                {
                    "id": str(t.id),
                    "title": t.title,
                    "published": t.published,
                    "level": t.level,
                }
                for t in topics
            ],
            weekly={"sessions_hosted": instructor.sessions_hosted},
        )
