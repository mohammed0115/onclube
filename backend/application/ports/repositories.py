"""
Repository ports (interfaces).

Method signatures cover what the command + query use cases need; they return
domain entities (currently Django model instances, treated as opaque by the
application layer beyond documented attributes — mappers convert them to DTOs).
Concrete adapters live in infrastructure.repositories.django.
"""
from abc import ABC, abstractmethod


class UserRepository(ABC):
    @abstractmethod
    def get(self, user_id):
        ...

    @abstractmethod
    def count_by_role(self, role):
        ...


class GoalRepository(ABC):
    @abstractmethod
    def list_active(self):
        ...

    @abstractmethod
    def get(self, goal_id):
        ...


class PlanRepository(ABC):
    @abstractmethod
    def list_active(self):
        ...

    @abstractmethod
    def get(self, plan_id):
        ...


class PlacementRepository(ABC):
    @abstractmethod
    def get_attempt(self, attempt_id):
        ...

    @abstractmethod
    def get_result_for_attempt(self, attempt):
        ...

    @abstractmethod
    def get_latest_result(self, student):
        ...

    @abstractmethod
    def list_active_questions(self):
        ...


class PaymentRepository(ABC):
    @abstractmethod
    def get(self, proof_id):
        """Return a PaymentProof by id (raises if missing)."""

    @abstractmethod
    def transaction_number_exists(self, transaction_number):
        ...

    @abstractmethod
    def get_latest_for_student(self, student):
        ...

    @abstractmethod
    def list_for_student(self, student):
        ...

    @abstractmethod
    def list_by_status(self, status):
        ...


# Naming alias used by the endpoint plan; same contract as PaymentRepository.
PaymentProofRepository = PaymentRepository


class SubscriptionRepository(ABC):
    @abstractmethod
    def get(self, subscription_id):
        ...

    @abstractmethod
    def get_active_for_student(self, student):
        """Return the student's active subscription or None."""

    @abstractmethod
    def count_active(self):
        ...


class BookingRepository(ABC):
    @abstractmethod
    def get(self, booking_id):
        ...

    @abstractmethod
    def get_slot(self, slot_id):
        ...

    @abstractmethod
    def list_open_slots(self, instructor_id):
        """Open availability slots for an instructor, ordered by start time."""

    @abstractmethod
    def list_all_slots(self, instructor):
        """All of an instructor's slots, ordered by start time."""

    @abstractmethod
    def has_confirmed_booking(self, student, topic):
        """True if the student has an upcoming/completed booking for the topic."""

    @abstractmethod
    def list_for_student(self, student):
        ...

    @abstractmethod
    def list_for_instructor(self, instructor):
        ...

    @abstractmethod
    def list_slots_in_range(self, instructor_id, start, end):
        """An instructor's slots with start_at in [start, end), ordered by start time."""

    @abstractmethod
    def list_all(self):
        """All bookings (admin), newest first."""


class TopicRepository(ABC):
    @abstractmethod
    def get(self, topic_id):
        ...

    @abstractmethod
    def list_published(self, *, category=None):
        ...

    @abstractmethod
    def list_for_instructor(self, instructor):
        ...


class QuestionRepository(ABC):
    @abstractmethod
    def get(self, question_id):
        ...

    @abstractmethod
    def list_approved_for_topic(self, topic):
        ...

    @abstractmethod
    def list_all_for_topic(self, topic):
        ...


class SessionRepository(ABC):
    @abstractmethod
    def get(self, session_id):
        ...

    @abstractmethod
    def get_by_booking(self, booking):
        ...

    @abstractmethod
    def save(self, session):
        ...


class AIReportRepository(ABC):
    @abstractmethod
    def get(self, report_id):
        ...

    @abstractmethod
    def get_by_session(self, session):
        ...

    @abstractmethod
    def list_for_student(self, student):
        ...


class NotificationRepository(ABC):
    @abstractmethod
    def get(self, notification_id):
        ...

    @abstractmethod
    def list_for_user(self, user):
        ...


# ── placement (Phase 8C) ──────────────────────────────────────────────────────
# All methods return DTOs / primitives — never raw Django models.

class PlacementQuestionRepository(ABC):
    @abstractmethod
    def list_active(self, question_type=None):
        """PUBLIC PlacementQuestionDTO list (no answer key), ordered."""

    @abstractmethod
    def get(self, question_id):
        ...

    @abstractmethod
    def known_ids(self, question_type=None):
        """Set of active question ids (for the 'fixed known questions' rule)."""


class PlacementAttemptRepository(ABC):
    @abstractmethod
    def create(self, *, student, goal=None, version=1):
        ...

    @abstractmethod
    def get(self, attempt_id):
        ...

    @abstractmethod
    def get_active(self, student):
        """The student's in_progress attempt as a DTO, or None."""

    @abstractmethod
    def latest(self, student):
        """The student's most recent attempt as a DTO, or None."""

    @abstractmethod
    def latest_for_student_id(self, student_id):
        """The most recent attempt for a student id as a DTO, or None."""

    @abstractmethod
    def mark_submitted(self, attempt_id):
        ...

    @abstractmethod
    def mark_assessed(self, attempt_id, *, provider_name, fallback_used):
        ...

    @abstractmethod
    def mark_reset(self, attempt_id):
        ...

    @abstractmethod
    def has_used_spoken(self, student):
        """True if any non-reset attempt already captured a spoken answer."""

    @abstractmethod
    def has_used_spoken_excluding(self, student, attempt_id):
        """True if a non-reset attempt OTHER than `attempt_id` already has a spoken answer."""


class PlacementAnswerRepository(ABC):
    @abstractmethod
    def save_written(self, *, attempt_id, question_id, answer_text, score=None):
        ...

    @abstractmethod
    def save_spoken(self, *, attempt_id, question_id, transcript_text,
                    source="manual", stt_provider="", stt_confidence=None,
                    spoken_attempt_number=1, score=None):
        ...

    @abstractmethod
    def written_count(self, attempt_id):
        ...

    @abstractmethod
    def spoken_count(self, attempt_id):
        ...

    @abstractmethod
    def list_written(self, attempt_id):
        """List of domain PlacementWrittenAnswer DTOs."""

    @abstractmethod
    def list_spoken(self, attempt_id):
        """List of domain PlacementSpokenAnswer DTOs."""

    @abstractmethod
    def get_spoken(self, *, attempt_id, question_id):
        """The stored answer as {"text", "source"}, or None if not answered."""

    @abstractmethod
    def list_interview_answers(self, attempt_id):
        """List of domain InterviewAnswerDTOs (question_id, order, transcript, source)."""


class PlacementInterviewSessionRepository(ABC):
    @abstractmethod
    def get_by_attempt(self, attempt_id):
        """The attempt's InterviewSessionDTO (answers=()), or None."""

    @abstractmethod
    def create(self, attempt_id):
        """Create a session in the CREATED state; return its InterviewSessionDTO."""

    @abstractmethod
    def mark_running(self, interview_id):
        """Move to RUNNING and stamp started_at if not already set."""

    @abstractmethod
    def set_index(self, interview_id, index):
        """Persist the resume point (current_question_index)."""

    @abstractmethod
    def mark_completed(self, interview_id):
        """Move to COMPLETED (all questions answered, not yet finalized)."""

    @abstractmethod
    def mark_finalized(self, interview_id):
        """Move to FINALIZED and stamp finished_at."""


class PlacementResultRepository(ABC):
    @abstractmethod
    def save(self, *, attempt_id, result, evaluator_version="", provider_name="heuristic", fallback_used=False):
        """Persist an assessor `PlacementAssessmentResult`; return a PlacementStoredResult."""

    @abstractmethod
    def get_for_attempt(self, attempt_id):
        """PlacementStoredResult or None."""

    @abstractmethod
    def get_latest_for_student(self, student):
        """The student's most recent stored result (PlacementStoredResult) or None."""


class PlacementResetAuditRepository(ABC):
    @abstractmethod
    def record(self, *, attempt_id, reset_by, reason):
        """Record an audited reset (derives the student from the attempt). Returns audit id."""

    @abstractmethod
    def reset_after_use(self, student):
        """True if an admin reset happened after the student's used spoken attempt."""


class PlacementProfileRepository(ABC):
    @abstractmethod
    def set_level(self, student, level):
        """Personalize the student's CEFR level from the placement result."""
