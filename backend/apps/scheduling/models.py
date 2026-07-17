"""
scheduling — instructor-owned topics/questions, availability and bookings.

Maps database design tables: topics, subtopics, questions, availability_slots,
bookings. Encodes critical constraints §2.1 (no double booking), the question
approval floor (§1.14) and the booking-visibility gate (§2.5, enforced in
services.get_topic_for_student).
"""
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.enums import (
    AvailabilityExceptionKind,
    BookingStatus,
    CEFRLevel,
    GroupSessionStatus,
    SlotStatus,
)
from apps.common.models import BaseModel, SoftDeleteModel, TimeStampedModel, UUIDModel


class Topic(BaseModel, SoftDeleteModel):
    """Owned by an instructor. AI only assists; instructor owns the content."""

    title = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    icon = models.CharField(max_length=40, null=True, blank=True)
    accent = models.CharField(max_length=60, null=True, blank=True)
    description = models.TextField(null=True, blank=True)  # shown pre-booking
    level = models.CharField(max_length=2, choices=CEFRLevel.choices)
    instructor = models.ForeignKey(
        "accounts.InstructorProfile", on_delete=models.PROTECT, related_name="topics"
    )
    vocabulary = models.JSONField(default=list)  # gated post-booking
    sample_prompts = models.JSONField(default=list)  # shown pre-booking (§2.5)
    published = models.BooleanField(default=False)

    class Meta:
        db_table = "topics"
        indexes = [
            models.Index(fields=["instructor"]),
            models.Index(
                fields=["published", "category"],
                name="topic_published_idx",
                condition=models.Q(published=True),
            ),
        ]

    def __str__(self):
        return self.title


class Subtopic(UUIDModel, TimeStampedModel):
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="subtopics")
    title = models.CharField(max_length=160)
    ai_generated = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "subtopics"
        indexes = [models.Index(fields=["topic", "sort_order"])]

    def __str__(self):
        return self.title


class Question(BaseModel):
    """
    Discussion question. AI-suggested questions are created approved=False and are
    student-visible only after the instructor approves (§1.14).
    """

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    ai_assisted = models.BooleanField(default=False)
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "questions"
        indexes = [
            models.Index(fields=["topic", "sort_order"]),
            models.Index(
                fields=["topic"],
                name="question_approved_idx",
                condition=models.Q(approved=True),
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(approved=False)
                    | (
                        models.Q(approved_by__isnull=False)
                        & models.Q(approved_at__isnull=False)
                    )
                ),
                name="chk_approved_question_has_approver",
            ),
        ]

    def clean(self):
        if self.approved and (self.approved_by_id is None or self.approved_at is None):
            raise ValidationError(
                "An approved question must record approved_by and approved_at."
            )

    def __str__(self):
        return self.text[:60]


class AvailabilitySlot(BaseModel):
    """One row per bookable slot. Unique per (instructor, start_at) — §2.1."""

    instructor = models.ForeignKey(
        "accounts.InstructorProfile",
        on_delete=models.CASCADE,
        related_name="availability_slots",
    )
    start_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=45)
    status = models.CharField(
        max_length=20, choices=SlotStatus.choices, default=SlotStatus.OPEN
    )

    class Meta:
        db_table = "availability_slots"
        constraints = [
            models.UniqueConstraint(
                fields=["instructor", "start_at"],
                name="uniq_slot_per_instructor_time",
            ),
            models.CheckConstraint(
                check=models.Q(duration_minutes__gt=0),
                name="chk_slot_duration_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["instructor", "status", "start_at"],
                name="slot_open_idx",
                condition=models.Q(status=SlotStatus.OPEN),
            ),
        ]

    def __str__(self):
        return f"Slot<{self.instructor_id} {self.start_at:%Y-%m-%d %H:%M} {self.status}>"


class Booking(BaseModel, SoftDeleteModel):
    """
    A confirmed seat against a slot. `slot` is a ForeignKey so a slot can hold
    a full booking history (an active booking plus any earlier cancelled ones),
    while the partial unique constraint `uniq_active_booking_per_slot` keeps the
    hard double-booking guard (§2.1): at most one UPCOMING booking per slot. A
    cancelled booking keeps its slot reference (history is preserved) and no
    longer blocks re-booking the released slot.
    """

    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.PROTECT, related_name="bookings"
    )
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name="bookings")
    topic_title = models.CharField(max_length=120)  # snapshot
    instructor = models.ForeignKey(
        "accounts.InstructorProfile", on_delete=models.PROTECT, related_name="bookings"
    )
    instructor_name = models.CharField(max_length=150)  # snapshot
    slot = models.ForeignKey(
        AvailabilitySlot, on_delete=models.PROTECT, related_name="bookings_for_slot"
    )
    subscription = models.ForeignKey(
        "billing.Subscription", on_delete=models.PROTECT, related_name="bookings"
    )
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=45)
    status = models.CharField(
        max_length=20, choices=BookingStatus.choices, default=BookingStatus.UPCOMING
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    credit_refunded = models.BooleanField(default=False)

    class Meta:
        db_table = "bookings"
        constraints = [
            # §2.1 double-booking guard: at most one *active* (upcoming) booking
            # per slot. Cancelled/completed bookings keep their slot reference for
            # history but do not block re-booking the released slot.
            models.UniqueConstraint(
                fields=["slot"],
                condition=models.Q(status=BookingStatus.UPCOMING),
                name="uniq_active_booking_per_slot",
            ),
        ]
        indexes = [
            models.Index(fields=["student", "-scheduled_at"]),
            models.Index(fields=["instructor", "scheduled_at"]),
            models.Index(
                fields=["status"],
                name="booking_upcoming_idx",
                condition=models.Q(status=BookingStatus.UPCOMING),
            ),
        ]

    def __str__(self):
        return f"Booking<{self.student_id} {self.topic_title} {self.status}>"


class SessionRating(BaseModel):
    """A student's rating + optional review of one completed session. Exactly one
    per booking; drives the instructor's aggregate `rating`."""

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, related_name="rating"
    )
    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="session_ratings"
    )
    instructor = models.ForeignKey(
        "accounts.InstructorProfile", on_delete=models.CASCADE, related_name="session_ratings"
    )
    stars = models.PositiveSmallIntegerField()  # 1..5
    comment = models.TextField(blank=True, default="")

    class Meta:
        db_table = "session_ratings"
        constraints = [
            models.CheckConstraint(
                check=models.Q(stars__gte=1) & models.Q(stars__lte=5),
                name="chk_session_rating_stars_range",
            ),
        ]
        indexes = [models.Index(fields=["instructor"])]

    def __str__(self):
        return f"SessionRating<{self.booking_id} {self.stars}★>"


class GroupSession(BaseModel, SoftDeleteModel):
    """A scheduled group conversation class: one instructor, many students, a
    shared topic and a seat capacity. The community side of the club — students
    browse and join upcoming sessions rather than booking a 1:1 slot."""

    title = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        "accounts.InstructorProfile", on_delete=models.PROTECT, related_name="group_sessions"
    )
    instructor_name = models.CharField(max_length=150)  # snapshot
    level = models.CharField(max_length=2, choices=CEFRLevel.choices)
    start_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=45)
    capacity = models.PositiveIntegerField(default=6)
    status = models.CharField(
        max_length=12, choices=GroupSessionStatus.choices, default=GroupSessionStatus.SCHEDULED
    )

    class Meta:
        db_table = "group_sessions"
        constraints = [
            models.CheckConstraint(
                check=models.Q(capacity__gt=0), name="chk_group_session_capacity_positive"
            ),
        ]
        indexes = [
            models.Index(fields=["status", "start_at"]),
            models.Index(fields=["instructor", "start_at"]),
        ]

    def __str__(self):
        return f"GroupSession<{self.title} @ {self.start_at:%Y-%m-%d %H:%M}>"


class GroupSessionAttendee(BaseModel):
    """One student's seat in a group session. Unique per (session, student)."""

    group_session = models.ForeignKey(
        GroupSession, on_delete=models.CASCADE, related_name="attendees"
    )
    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="group_attendances"
    )

    class Meta:
        db_table = "group_session_attendees"
        constraints = [
            models.UniqueConstraint(
                fields=["group_session", "student"], name="uniq_group_session_attendee"
            ),
        ]
        indexes = [models.Index(fields=["student"])]

    def __str__(self):
        return f"GroupSessionAttendee<{self.group_session_id} {self.student_id}>"


class AvailabilityException(BaseModel):
    """A time range during which an instructor is unavailable — vacation, a public
    holiday, or an ad-hoc block. Any open slot whose start falls inside an active
    exception is not bookable, and new bookings in the range are rejected."""

    instructor = models.ForeignKey(
        "accounts.InstructorProfile", on_delete=models.CASCADE, related_name="availability_exceptions"
    )
    kind = models.CharField(max_length=10, choices=AvailabilityExceptionKind.choices)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    note = models.CharField(max_length=160, blank=True, default="")

    class Meta:
        db_table = "availability_exceptions"
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_at__gt=models.F("start_at")),
                name="chk_availability_exception_range",
            ),
        ]
        indexes = [models.Index(fields=["instructor", "start_at"])]

    def __str__(self):
        return f"AvailabilityException<{self.instructor_id} {self.kind} {self.start_at:%Y-%m-%d}>"
