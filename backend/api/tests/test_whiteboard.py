"""
Whiteboard — backend guarantees (Sprint 8.4).

The whiteboard is a client-canvas capability layered on the already-authorized
live session. There is NO whiteboard endpoint, transport, or persistence — the
backend's responsibilities are only (a) the participant gate that governs the
room and (b) the transport-neutral operation rule. These tests pin that contract:

  - authorization + participant validation (assigned student/instructor only; admin never)
  - provider abstraction                    (any signaling reuses existing ports)
  - no persistence                          (no board model / no field / no migration)
  - operation validation (bonus)            (provider-neutral op shape)
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_joiner
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from domain.exceptions import InvalidWhiteboardOperation, PermissionDenied
from domain.rules import whiteboard as wb_rules
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


# ── authorization + participant validation ────────────────────────────────────
def test_only_assigned_participants_may_draw():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    assert ensure_session_joiner(booking.student.user, session) == "student"
    assert ensure_session_joiner(booking.instructor.user, session) == "instructor"

    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_student().user, session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_instructor().user, session)
    with pytest.raises(PermissionDenied):  # admin may NEVER draw
        ensure_session_joiner(make_admin(), session)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── no persistence / no schema change ─────────────────────────────────────────
def test_no_whiteboard_model_and_no_board_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert not any(("whiteboard" in n or "board" in n or "stroke" in n) for n in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any(("board" in n or "whiteboard" in n or "stroke" in n) for n in field_names), field_names


# ── operation validation (provider-neutral) ───────────────────────────────────
def test_operation_validation_accepts_valid_and_rejects_invalid():
    clear = {"type": "clear", "id": "1", "authorId": "u1"}
    stroke = {"type": "stroke", "id": "2", "authorId": "u1", "tool": "pen", "color": "#111", "width": 4,
              "points": [{"x": 0.1, "y": 0.2}, {"x": 0.5, "y": 0.6}]}
    assert wb_rules.validate_operation(clear) is clear
    assert wb_rules.validate_operation(stroke) is stroke

    bad_ops = [
        {"type": "text", "id": "3", "authorId": "u1"},                    # unsupported tool/type
        {"type": "stroke", "id": "4", "authorId": "u1", "tool": "pen", "points": []},  # no points
        {"type": "stroke", "id": "5", "authorId": "u1", "tool": "shape",  # invalid tool
         "points": [{"x": 0.1, "y": 0.1}]},
        {"type": "stroke", "id": "6", "authorId": "u1", "tool": "pen",     # out-of-range point
         "points": [{"x": 2.0, "y": 0.1}]},
    ]
    for op in bad_ops:
        with pytest.raises(InvalidWhiteboardOperation):
            wb_rules.validate_operation(op)
