"""
Participant signals — backend guarantees (Sprint 8.6).

Raise hand + reactions are a client-transport capability layered on the already-
authorized live session. There is NO signal endpoint, transport, or persistence —
the backend's responsibilities are only (a) the participant gate that governs the
room and (b) the transport-neutral reaction rule. These tests pin that contract:

  - authorization + participant validation (assigned student/instructor only; admin never)
  - provider abstraction                    (any signaling reuses existing ports)
  - reaction validation                     (approved set only)
  - no persistence                          (no signal model / no field / no migration)
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_joiner
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from domain.exceptions import PermissionDenied, UnsupportedReaction
from domain.rules import signals as signal_rules
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


# ── authorization + participant validation ────────────────────────────────────
def test_only_assigned_participants_may_signal():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    assert ensure_session_joiner(booking.student.user, session) == "student"
    assert ensure_session_joiner(booking.instructor.user, session) == "instructor"

    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_student().user, session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_instructor().user, session)
    with pytest.raises(PermissionDenied):  # admin may NEVER raise hand / react
        ensure_session_joiner(make_admin(), session)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── reaction validation ───────────────────────────────────────────────────────
def test_reaction_validation_allows_only_the_approved_set():
    for r in ("👍", "👏", "❤️", "❓", "⏳"):
        assert signal_rules.validate_reaction(r) == r
    for bad in ("😀", "🔥", "gif", "", "👍👍"):
        with pytest.raises(UnsupportedReaction):
            signal_rules.validate_reaction(bad)


# ── no persistence / no schema change ─────────────────────────────────────────
def test_no_signal_model_and_no_signal_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert not any(("reaction" in n or "raisehand" in n or "signal" in n) for n in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any(("hand" in n or "reaction" in n or "signal" in n) for n in field_names), field_names
