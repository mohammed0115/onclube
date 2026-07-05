"""
Session recording — backend guarantees (Sprint 8.7).

Recording is a client-orchestrated, provider-driven capability layered on the
already-authorized live session. There is NO recording endpoint, media handling,
or persistence — the backend's responsibilities are only (a) the instructor-only
control gate and (b) the transport-neutral recording state machine. These tests
pin that contract:

  - authorization + participant validation (assigned INSTRUCTOR only; student/admin never)
  - provider abstraction                    (signaling reuses existing ports)
  - idempotent start / idempotent stop
  - single active recording per session
  - no persistence beyond metadata          (no recording model / no field / no migration)
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_recorder
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from domain.exceptions import InvalidRecordingTransition, PermissionDenied
from domain.rules import recording as rec_rules
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


# ── authorization + participant validation ────────────────────────────────────
def test_only_the_assigned_instructor_may_control_recording():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    assert ensure_session_recorder(booking.instructor.user, session) == "instructor"

    with pytest.raises(PermissionDenied):  # the student cannot record
        ensure_session_recorder(booking.student.user, session)
    with pytest.raises(PermissionDenied):  # a different instructor cannot record
        ensure_session_recorder(make_instructor().user, session)
    with pytest.raises(PermissionDenied):  # an admin cannot record
        ensure_session_recorder(make_admin(), session)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── idempotent start / stop ───────────────────────────────────────────────────
def test_start_is_idempotent():
    s = rec_rules.start(rec_rules.IDLE)
    assert s == rec_rules.RECORDING
    assert rec_rules.start(s) == rec_rules.RECORDING  # no second recording


def test_stop_is_idempotent():
    s = rec_rules.stop(rec_rules.RECORDING)
    assert s == rec_rules.PROCESSING
    assert rec_rules.stop(s) == rec_rules.PROCESSING


# ── single active recording per session ───────────────────────────────────────
def test_single_active_recording_rule():
    s = rec_rules.start(rec_rules.IDLE)
    # Starting again while recording keeps the SAME single active recording.
    assert rec_rules.start(s) == rec_rules.RECORDING
    # Cannot start a new recording while one is processing.
    with pytest.raises(InvalidRecordingTransition):
        rec_rules.start(rec_rules.PROCESSING)


def test_cancelled_cannot_resume_and_invalid_stops_rejected():
    assert rec_rules.cancel(rec_rules.RECORDING) == rec_rules.CANCELLED
    assert rec_rules.cancel(rec_rules.CANCELLED) == rec_rules.CANCELLED  # idempotent
    with pytest.raises(InvalidRecordingTransition):
        rec_rules.stop(rec_rules.IDLE)  # nothing to stop
    # Ending the session finalizes an active recording.
    assert rec_rules.finalize(rec_rules.RECORDING) == rec_rules.PROCESSING
    assert rec_rules.finalize(rec_rules.COMPLETED) == rec_rules.COMPLETED


# ── no persistence beyond metadata ────────────────────────────────────────────
def test_no_recording_model_and_no_recording_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert not any(("recording" in n or "egress" in n) for n in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any(("recording" in n or "record" in n) for n in field_names), field_names
