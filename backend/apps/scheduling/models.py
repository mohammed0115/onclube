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
    BookingStatus,
    CEFRLevel,
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
    A confirmed seat against a slot. `slot` is OneToOne, giving the hard
    double-booking guard (§2.1). The reverse accessors `slot.booking` and
    `booking.report` (from AIReport) replace the design's back-FKs.
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
    slot = models.OneToOneField(
        AvailabilitySlot, on_delete=models.PROTECT, related_name="booking"
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
