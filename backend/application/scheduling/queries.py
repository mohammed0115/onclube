"""
Scheduling query use cases (read-only).

All enforce ownership/role via the permission boundary and return DTOs only.
The full-question gate (§2.5) lives in GetTopicPreviewOrFullUseCase /
GetQuestionsForBookingUseCase.
"""
from apps.common.enums import BookingStatus
from application import mappers
from application.permissions import (
    ensure_booking_viewer,
    get_instructor_profile,
    get_student_profile,
)
from domain.dtos import (
    InstructorDashboardResult,
    StudentDashboardResult,
    TopicFullResult,
    TopicPreviewResult,
)
from domain.exceptions import QuestionsNotAvailable
from infrastructure.container import (
    default_ai_report_repository,
    default_booking_repository,
    default_question_repository,
    default_topic_repository,
)


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

        return StudentDashboardResult(
            sessions_remaining=student.sessions_remaining,
            sessions_completed=len(completed),
            payment_status=student.payment_status,
            level=student.level,
            latest_score=latest_score,
            next_session=mappers.booking_list_item(next_b) if next_b else None,
            recent_sessions=[mappers.booking_list_item(b) for b in bookings[:5]],
            progress_trend=progress,
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
        topics = self.topics.list_for_instructor(instructor)

        return InstructorDashboardResult(
            upcoming_sessions=len(upcoming),
            active_students=len({b.student_id for b in bookings}),
            topics_owned=len(topics),
            average_rating=float(instructor.rating),
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
