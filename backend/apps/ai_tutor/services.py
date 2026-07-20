"""
AI-tutor business rules: subscription gate + 5-minute practice sessions.

The conversation content comes from `infrastructure.gateways.ai_tutor` (OpenAI or
heuristic); this module owns access control, the time cap, and persistence.
"""
from django.db import transaction
from django.utils import timezone

from apps.common.enums import AITutorSessionStatus, SubscriptionStatus
from apps.common.exceptions import BusinessRuleError

from .models import AI_TUTOR_SESSION_MINUTES, AITutorSession, AITutorSubscription

MAX_MESSAGE_LEN = 1000


def active_subscription(student):
    """The student's usable AI-tutor subscription, or None."""
    return (
        AITutorSubscription.objects.filter(
            student=student,
            status=SubscriptionStatus.ACTIVE,
            expires_at__gt=timezone.now(),
        )
        .order_by("-started_at")
        .first()
    )


def _remaining_seconds(session, now=None) -> int:
    now = now or timezone.now()
    return max(0, int((session.expires_at - now).total_seconds()))


def _serialize(session, now=None) -> dict:
    now = now or timezone.now()
    return {
        "sessionId": str(session.id),
        "topic": session.topic,
        "status": session.status,
        "startedAt": session.started_at.isoformat(),
        "expiresAt": session.expires_at.isoformat(),
        "remainingSeconds": _remaining_seconds(session, now),
        "messages": session.messages,
    }


def _expire_if_needed(session, now=None):
    now = now or timezone.now()
    if session.status == AITutorSessionStatus.ACTIVE and now >= session.expires_at:
        session.status = AITutorSessionStatus.ENDED
        session.ended_at = session.expires_at
        session.save(update_fields=["status", "ended_at", "updated_at"])
    return session


def get_status(student) -> dict:
    sub = active_subscription(student)
    active_sess = (
        AITutorSession.objects.filter(student=student, status=AITutorSessionStatus.ACTIVE)
        .order_by("-started_at")
        .first()
    )
    if active_sess is not None:
        _expire_if_needed(active_sess)
        if active_sess.status != AITutorSessionStatus.ACTIVE:
            active_sess = None
    return {
        "subscribed": sub is not None,
        "subscription": {"expiresAt": sub.expires_at.isoformat()} if sub else None,
        "sessionMinutes": AI_TUTOR_SESSION_MINUTES,
        "activeSession": _serialize(active_sess) if active_sess else None,
    }


@transaction.atomic
def start_session(student, *, topic="") -> dict:
    sub = active_subscription(student)
    if sub is None:
        raise BusinessRuleError(
            "An active AI-tutor subscription is required.", code="no_ai_tutor_subscription"
        )
    # Only one live practice at a time — close any lingering active session.
    AITutorSession.objects.filter(
        student=student, status=AITutorSessionStatus.ACTIVE
    ).update(status=AITutorSessionStatus.ENDED, ended_at=timezone.now())

    from infrastructure.gateways.ai_tutor import generate_tutor_reply

    now = timezone.now()
    session = AITutorSession.objects.create(
        student=student,
        subscription=sub,
        topic=(topic or "").strip()[:120],
        started_at=now,
        expires_at=now + timezone.timedelta(minutes=AI_TUTOR_SESSION_MINUTES),
        status=AITutorSessionStatus.ACTIVE,
        messages=[],
    )
    opening = generate_tutor_reply([], topic=session.topic, level=getattr(student, "level", None))
    session.messages = [{"role": "tutor", "text": opening, "at": now.isoformat()}]
    session.save(update_fields=["messages", "updated_at"])
    return _serialize(session, now)


def post_message(student, session_id, text) -> dict:
    # NOTE: deliberately NOT wrapped in a single transaction — when the session has
    # expired we must persist the "ended" close AND raise; an enclosing atomic would
    # roll the close back. Each save here is a single-row autocommit.
    text = (text or "").strip()
    if not text:
        raise BusinessRuleError("Message cannot be empty.", code="empty_message")
    if len(text) > MAX_MESSAGE_LEN:
        raise BusinessRuleError("Message is too long.", code="message_too_long")

    session = AITutorSession.objects.filter(pk=session_id, student=student).first()
    if session is None:
        raise BusinessRuleError("Practice session not found.", code="session_not_found")

    now = timezone.now()
    if session.status != AITutorSessionStatus.ACTIVE or now >= session.expires_at:
        _expire_if_needed(session, now)  # persists ENDED (autocommit) before we raise
        raise BusinessRuleError(
            "This 5-minute practice has ended. Start a new one.", code="session_ended"
        )

    from infrastructure.gateways.ai_tutor import generate_tutor_reply

    history = list(session.messages)
    history.append({"role": "student", "text": text, "at": now.isoformat()})
    reply = generate_tutor_reply(history, topic=session.topic, level=getattr(student, "level", None))
    history.append({"role": "tutor", "text": reply, "at": timezone.now().isoformat()})
    session.messages = history

    # If time ran out during this exchange, close the session now.
    if timezone.now() >= session.expires_at:
        session.status = AITutorSessionStatus.ENDED
        session.ended_at = session.expires_at
    session.save(update_fields=["messages", "status", "ended_at", "updated_at"])
    return _serialize(session)


@transaction.atomic
def end_session(student, session_id) -> dict:
    session = (
        AITutorSession.objects.select_for_update()
        .filter(pk=session_id, student=student)
        .first()
    )
    if session is None:
        raise BusinessRuleError("Practice session not found.", code="session_not_found")
    if session.status == AITutorSessionStatus.ACTIVE:
        session.status = AITutorSessionStatus.ENDED
        session.ended_at = timezone.now()
        session.save(update_fields=["status", "ended_at", "updated_at"])
    return _serialize(session)
