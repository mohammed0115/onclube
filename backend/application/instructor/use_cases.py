"""
Instructor authoring command use cases — topics, questions, availability.

Ownership: every write is gated on the actor owning the topic (or being admin).
AI drafts stay `approved=False` until ApproveAIQuestionUseCase; manual questions
authored by the instructor are approved on creation.
"""
from django.db import transaction
from django.utils import timezone

from apps.common.enums import SlotStatus
from apps.scheduling.models import AvailabilitySlot, Question, Topic
from application import mappers
from application.permissions import (
    ensure_instructor_owns_topic,
    get_instructor_profile,
)
from domain import events as domain_events
from domain.dtos import QuestionFullResult, TopicFullResult
from domain.exceptions import InvalidStateTransition
from infrastructure.container import (
    default_event_bus,
    default_question_repository,
    default_topic_repository,
)

_EDITABLE_TOPIC_FIELDS = (
    "title", "category", "level", "description", "icon", "accent",
    "vocabulary", "sample_prompts",
)


class CreateTopicUseCase:
    def __init__(self, *, questions=None):
        self.questions = questions or default_question_repository()

    @transaction.atomic
    def execute(self, *, actor, title, category, level, description=None,
                icon=None, accent=None, vocabulary=None, sample_prompts=None) -> TopicFullResult:
        instructor = get_instructor_profile(actor)
        topic = Topic.objects.create(
            instructor=instructor,
            title=title,
            category=category,
            level=level,
            description=description or "",
            icon=icon,
            accent=accent,
            vocabulary=vocabulary or [],
            sample_prompts=sample_prompts or [],
            published=False,
            created_by=actor,
            updated_by=actor,
        )
        return mappers.topic_full(topic, [])


class UpdateTopicUseCase:
    def __init__(self, *, topics=None, questions=None):
        self.topics = topics or default_topic_repository()
        self.questions = questions or default_question_repository()

    @transaction.atomic
    def execute(self, *, actor, topic_id, **fields) -> TopicFullResult:
        topic = self.topics.get(topic_id)
        ensure_instructor_owns_topic(actor, topic)
        for name in _EDITABLE_TOPIC_FIELDS:
            if fields.get(name) is not None:
                setattr(topic, name, fields[name])
        topic.updated_by = actor
        topic.save()
        return mappers.topic_full(topic, self.questions.list_all_for_topic(topic))


class PublishTopicUseCase:
    def __init__(self, *, topics=None, questions=None, events=None):
        self.topics = topics or default_topic_repository()
        self.questions = questions or default_question_repository()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, topic_id) -> TopicFullResult:
        topic = self.topics.get(topic_id)
        ensure_instructor_owns_topic(actor, topic)
        approved = self.questions.list_approved_for_topic(topic)
        if not topic.title or not topic.description or not approved:
            raise InvalidStateTransition(
                "A topic needs a title, description and at least one approved "
                "question before it can be published."
            )
        topic.published = True
        topic.updated_by = actor
        topic.save(update_fields=["published", "updated_by", "updated_at"])
        self.events.publish(
            domain_events.TopicPublished(
                topic_id=str(topic.id), instructor_id=str(topic.instructor_id)
            )
        )
        return mappers.topic_full(topic, self.questions.list_all_for_topic(topic))


class AddManualQuestionUseCase:
    """Instructor-authored question — approved immediately (they own the content)."""

    def __init__(self, *, topics=None):
        self.topics = topics or default_topic_repository()

    @transaction.atomic
    def execute(self, *, actor, topic_id, text) -> QuestionFullResult:
        topic = self.topics.get(topic_id)
        ensure_instructor_owns_topic(actor, topic)
        order = topic.questions.count() + 1
        question = Question.objects.create(
            topic=topic,
            text=text,
            ai_assisted=False,
            approved=True,
            approved_by=actor,
            approved_at=timezone.now(),
            sort_order=order,
            created_by=actor,
            updated_by=actor,
        )
        return mappers.question_full(question)


class ApproveAIQuestionUseCase:
    """Flip an AI-drafted (or any unapproved) question to approved on an owned topic."""

    def __init__(self, *, questions=None):
        self.questions = questions or default_question_repository()

    @transaction.atomic
    def execute(self, *, actor, question_id) -> QuestionFullResult:
        question = self.questions.get(question_id)
        ensure_instructor_owns_topic(actor, question.topic)
        if not question.approved:
            question.approved = True
            question.approved_by = actor
            question.approved_at = timezone.now()
            question.updated_by = actor
            question.save(
                update_fields=["approved", "approved_by", "approved_at", "updated_by", "updated_at"]
            )
        return mappers.question_full(question)


class SetAvailabilityUseCase:
    """
    Replace an instructor's OPEN slots with the desired set. Existing BOOKED slots
    are preserved (never freed here); OPEN slots no longer desired are removed.
    """

    @transaction.atomic
    def execute(self, *, actor, slots) -> list:
        instructor = get_instructor_profile(actor)
        desired = {sl["start_at"]: sl.get("duration_minutes", 45) for sl in slots}
        existing = {
            slot.start_at: slot
            for slot in AvailabilitySlot.objects.filter(instructor=instructor)
        }

        for start_at, duration in desired.items():
            slot = existing.get(start_at)
            if slot is None:
                AvailabilitySlot.objects.create(
                    instructor=instructor,
                    start_at=start_at,
                    duration_minutes=duration,
                    status=SlotStatus.OPEN,
                    created_by=actor,
                    updated_by=actor,
                )
            elif slot.status == SlotStatus.BLOCKED:
                slot.status = SlotStatus.OPEN
                slot.duration_minutes = duration
                slot.updated_by = actor
                slot.save(update_fields=["status", "duration_minutes", "updated_by", "updated_at"])

        for start_at, slot in existing.items():
            if start_at not in desired and slot.status == SlotStatus.OPEN:
                slot.delete()

        current = AvailabilitySlot.objects.filter(instructor=instructor).order_by("start_at")
        return [mappers.availability_slot(s) for s in current]
