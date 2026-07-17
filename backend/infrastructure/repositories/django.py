"""Django ORM implementations of the repository ports."""
from django.utils import timezone

from apps.accounts.models import User
from apps.ai_reports.models import AIReport
from apps.billing.models import PaymentProof, Subscription
from apps.common.enums import (
    AIReportStatus,
    BookingStatus,
    PaymentProofStatus,
    SlotStatus,
    SubscriptionStatus,
)
from apps.notifications.models import Notification
from apps.onboarding.models import Goal, PlacementAttempt, PlacementQuestion, PlacementResult
from apps.billing.models import Plan
from apps.scheduling.models import AvailabilityException, AvailabilitySlot, Booking, Question, Topic
from apps.sessions.models import Session

from application.ports.repositories import (
    AIReportRepository,
    BookingRepository,
    GoalRepository,
    NotificationRepository,
    PaymentRepository,
    PlacementRepository,
    PlanRepository,
    QuestionRepository,
    SessionRepository,
    SubscriptionRepository,
    TopicRepository,
    UserRepository,
)

_TOPIC_RELATIONS = ("instructor__user",)
_TOPIC_PREFETCH = ("subtopics",)
_BOOKING_LIST_RELATED = ("report", "session")


def _exception_intervals(instructor_id):
    """[start, end) ranges the instructor is unavailable (vacation/holiday/block)."""
    return [
        (e.start_at, e.end_at)
        for e in AvailabilityException.objects.filter(instructor_id=instructor_id).only("start_at", "end_at")
    ]


def _covered(dt, intervals) -> bool:
    return any(start <= dt < end for start, end in intervals)


class DjangoUserRepository(UserRepository):
    def get(self, user_id):
        return User.objects.get(pk=user_id)

    def count_by_role(self, role):
        return User.objects.filter(role=role, deleted_at__isnull=True).count()


class DjangoGoalRepository(GoalRepository):
    def list_active(self):
        return list(Goal.objects.filter(active=True).order_by("label"))

    def get(self, goal_id):
        return Goal.objects.get(pk=goal_id)


class DjangoPlanRepository(PlanRepository):
    def list_active(self):
        return list(Plan.objects.filter(active=True).order_by("price"))

    def get(self, plan_id):
        return Plan.objects.get(pk=plan_id)


class DjangoPlacementRepository(PlacementRepository):
    def get_attempt(self, attempt_id):
        return PlacementAttempt.objects.select_related("student__user").get(pk=attempt_id)

    def get_result_for_attempt(self, attempt):
        return PlacementResult.objects.filter(attempt=attempt).first()

    def get_latest_result(self, student):
        return (
            PlacementResult.objects.filter(student=student)
            .order_by("-created_at")
            .first()
        )

    def list_active_questions(self):
        return list(PlacementQuestion.objects.filter(active=True).order_by("created_at"))


class DjangoPaymentRepository(PaymentRepository):
    def get(self, proof_id):
        return PaymentProof.objects.select_related(
            "student__user", "plan", "subscription", "receipt_file"
        ).get(pk=proof_id)

    def transaction_number_exists(self, transaction_number):
        return PaymentProof.objects.filter(transaction_number=transaction_number).exists()

    def get_latest_for_student(self, student):
        return (
            PaymentProof.objects.select_related("plan", "receipt_file")
            .filter(student=student)
            .order_by("-submitted_at")
            .first()
        )

    def list_for_student(self, student):
        return list(
            PaymentProof.objects.select_related("receipt_file")
            .filter(student=student)
            .order_by("-submitted_at")
        )

    def list_by_status(self, status):
        return list(
            PaymentProof.objects.select_related("student__user")
            .filter(status=status)
            .order_by("submitted_at")
        )


class DjangoSubscriptionRepository(SubscriptionRepository):
    def get(self, subscription_id):
        return Subscription.objects.select_related("student__user", "plan").get(
            pk=subscription_id
        )

    def get_active_for_student(self, student):
        return (
            Subscription.objects.select_related("plan")
            .filter(student=student, status=SubscriptionStatus.ACTIVE)
            .order_by("-started_at")
            .first()
        )

    def count_active(self):
        return Subscription.objects.filter(status=SubscriptionStatus.ACTIVE).count()


class DjangoBookingRepository(BookingRepository):
    def get(self, booking_id):
        return Booking.objects.select_related(
            "student__user", "slot", "subscription", "topic", "instructor__user",
            "report", "session",
        ).get(pk=booking_id)

    def get_slot(self, slot_id):
        return AvailabilitySlot.objects.select_related("instructor__user").get(pk=slot_id)

    def list_open_slots(self, instructor_id):
        # Only future open slots are bookable; never surface past slots, and drop
        # any slot that falls inside an availability exception (vacation/holiday/block).
        slots = AvailabilitySlot.objects.filter(
            instructor_id=instructor_id,
            status=SlotStatus.OPEN,
            start_at__gte=timezone.now(),
        ).order_by("start_at")
        intervals = _exception_intervals(instructor_id)
        return [s for s in slots if not _covered(s.start_at, intervals)]

    def list_all_slots(self, instructor):
        return list(
            AvailabilitySlot.objects.filter(instructor=instructor).order_by("start_at")
        )

    def has_confirmed_booking(self, student, topic):
        return Booking.objects.filter(
            student=student,
            topic=topic,
            status__in=[BookingStatus.UPCOMING, BookingStatus.COMPLETED],
        ).exists()

    def list_for_student(self, student):
        return list(
            Booking.objects.select_related(*_BOOKING_LIST_RELATED)
            .filter(student=student)
            .order_by("-scheduled_at")
        )

    def list_for_instructor(self, instructor):
        return list(
            Booking.objects.select_related("student", *_BOOKING_LIST_RELATED)
            .filter(instructor=instructor)
            .order_by("-scheduled_at")
        )

    def list_slots_in_range(self, instructor_id, start, end):
        slots = AvailabilitySlot.objects.filter(
            instructor_id=instructor_id, start_at__gte=start, start_at__lt=end
        ).order_by("start_at")
        intervals = _exception_intervals(instructor_id)
        return [s for s in slots if not _covered(s.start_at, intervals)]

    def list_all(self):
        return list(
            Booking.objects.select_related("student__user", *_BOOKING_LIST_RELATED)
            .order_by("-scheduled_at")
        )


class DjangoTopicRepository(TopicRepository):
    def get(self, topic_id):
        return (
            Topic.objects.select_related(*_TOPIC_RELATIONS)
            .prefetch_related(*_TOPIC_PREFETCH)
            .get(pk=topic_id)
        )

    def list_published(self, *, category=None):
        qs = (
            Topic.objects.select_related(*_TOPIC_RELATIONS)
            .prefetch_related(*_TOPIC_PREFETCH)
            .filter(published=True)
        )
        if category:
            qs = qs.filter(category=category)
        return list(qs.order_by("category", "title"))

    def practice_content(self):
        """Study material for the practice hub: deduped vocabulary + practice
        phrases aggregated from published topics."""
        vocab, phrases = [], []
        seen_v, seen_p = set(), set()
        for t in Topic.objects.filter(published=True).only("vocabulary", "sample_prompts"):
            for w in (t.vocabulary or []):
                k = str(w).strip().lower()
                if k and k not in seen_v:
                    seen_v.add(k)
                    vocab.append(str(w).strip())
            for p in (t.sample_prompts or []):
                text = (p.get("text") if isinstance(p, dict) else str(p)) or ""
                k = text.strip().lower()
                if k and k not in seen_p:
                    seen_p.add(k)
                    phrases.append(text.strip())
        return {"vocabulary": vocab[:60], "phrases": phrases[:30]}

    def list_for_instructor(self, instructor):
        return list(
            Topic.objects.select_related(*_TOPIC_RELATIONS)
            .prefetch_related(*_TOPIC_PREFETCH)
            .filter(instructor=instructor)
            .order_by("-created_at")
        )


class DjangoQuestionRepository(QuestionRepository):
    def get(self, question_id):
        return Question.objects.select_related("topic__instructor__user").get(pk=question_id)

    def list_approved_for_topic(self, topic):
        return list(
            Question.objects.filter(topic=topic, approved=True).order_by("sort_order")
        )

    def list_all_for_topic(self, topic):
        return list(Question.objects.filter(topic=topic).order_by("sort_order"))


class DjangoSessionRepository(SessionRepository):
    def get(self, session_id):
        qs = Session.objects.select_related(
            "booking__student__user", "booking__topic", "booking__instructor__user"
        )
        try:
            return qs.get(pk=session_id)
        except Session.DoesNotExist:
            # Dashboard / booking links pass a booking id; resolve to its room
            # so /sessions/<bookingId>/ opens the same live session.
            session = qs.filter(booking_id=session_id).first()
            if session is None:
                raise
            return session

    def get_by_booking(self, booking):
        return Session.objects.filter(booking=booking).first()

    def save(self, session):
        session.save()
        return session


class DjangoAIReportRepository(AIReportRepository):
    def get(self, report_id):
        return AIReport.objects.select_related(
            "student__user",
            "booking__topic",
            "booking__instructor__user",
            "session",
        ).get(pk=report_id)

    def get_by_session(self, session):
        return AIReport.objects.filter(session=session).first()

    def list_for_student(self, student):
        return list(
            AIReport.objects.filter(student=student, status=AIReportStatus.READY)
            .order_by("session_date")
        )


class DjangoNotificationRepository(NotificationRepository):
    def get(self, notification_id):
        return Notification.objects.get(pk=notification_id)

    def list_for_user(self, user):
        return list(Notification.objects.filter(user=user).order_by("-created_at"))
