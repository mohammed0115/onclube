"""
In-session chat — backend guarantees (Sprint 8.3).

Chat is a client-transport capability layered on the already-authorized live
session. There is NO chat endpoint, transport, or persistence — the backend's
responsibilities are only (a) the participant gate that governs the room and
(b) the transport-neutral content rule. These tests pin that contract:

  - authorization + participant validation (assigned student/instructor only; admin never)
  - message validation                     (empty / whitespace / max length)
  - provider abstraction                    (any signaling reuses existing ports)
  - no persistence                          (no chat model / no chat field / no migration)
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_joiner
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from domain.exceptions import ChatMessageTooLong, EmptyChatMessage, PermissionDenied
from domain.rules import chat as chat_rules
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


# ── authorization + participant validation ────────────────────────────────────
def test_only_assigned_participants_may_chat():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    # Assigned participants pass the same gate that lets them into the room.
    assert ensure_session_joiner(booking.student.user, session) == "student"
    assert ensure_session_joiner(booking.instructor.user, session) == "instructor"

    # Everyone else is rejected — so they can never send a message.
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_student().user, session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_instructor().user, session)
    with pytest.raises(PermissionDenied):  # admin may NEVER send
        ensure_session_joiner(make_admin(), session)


# ── message validation ────────────────────────────────────────────────────────
def test_message_validation_trims_and_enforces_bounds():
    assert chat_rules.validate_message("  hello  ") == "hello"

    for bad in ("", "   ", "\n\t "):
        with pytest.raises(EmptyChatMessage):
            chat_rules.validate_message(bad)

    with pytest.raises(ChatMessageTooLong):
        chat_rules.validate_message("x" * (chat_rules.MAX_MESSAGE_LENGTH + 1))

    # Exactly at the limit is allowed.
    assert len(chat_rules.validate_message("y" * chat_rules.MAX_MESSAGE_LENGTH)) == chat_rules.MAX_MESSAGE_LENGTH


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    # If chat signaling is ever added it rides these existing ports — this sprint
    # introduces no new provider surface.
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── no persistence / no schema change ─────────────────────────────────────────
def test_no_chat_model_and_no_chat_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert "chatmessage" not in model_names
    assert not any("chat" in name for name in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any("chat" in n or "message" in n for n in field_names), field_names
