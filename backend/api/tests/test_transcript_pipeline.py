"""
Live-transcript pipeline — backend guarantees (Sprint 8.9).

The pipeline is a provider-driven capability layered on the already-authorized
live session. There is NO transcript-pipeline endpoint or persistence — the
backend's responsibilities are only (a) the participant gate (admin never
generates transcript) and (b) the transport-neutral segment rules (order, dedup,
final-immutable, finalize-pending). These tests pin that contract:

  - authorization + participant validation (assigned student/instructor; admin never)
  - provider abstraction
  - segment ordering
  - duplicate suppression
  - final immutable
  - reconnect (re-receiving segments is safe)
  - no persistence
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_joiner
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from domain.exceptions import PermissionDenied
from domain.rules import transcript_pipeline as tp
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


def seg(seg_id, started_at, text, is_final=False):
    return {"segmentId": seg_id, "startedAt": started_at, "text": text, "isFinal": is_final}


# ── authorization + participant validation ────────────────────────────────────
def test_only_assigned_participants_generate_transcript_admin_never():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    assert ensure_session_joiner(booking.student.user, session) == "student"
    assert ensure_session_joiner(booking.instructor.user, session) == "instructor"

    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_student().user, session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_instructor().user, session)
    with pytest.raises(PermissionDenied):  # admin never generates transcript
        ensure_session_joiner(make_admin(), session)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── segment ordering ──────────────────────────────────────────────────────────
def test_segments_ordered_by_started_at():
    store = {}
    tp.merge_segment(store, seg("b", "2026-07-05T10:00:02Z", "second", True))
    tp.merge_segment(store, seg("a", "2026-07-05T10:00:01Z", "first", True))
    tp.merge_segment(store, seg("c", "2026-07-05T10:00:03Z", "third", True))
    assert [s["text"] for s in tp.ordered(store)] == ["first", "second", "third"]


# ── duplicate suppression + partial update + final immutable ──────────────────
def test_partial_updates_until_final_then_immutable():
    store = {}
    tp.merge_segment(store, seg("s1", "t1", "hel", False))
    tp.merge_segment(store, seg("s1", "t1", "hello", False))  # partial update
    assert store["s1"]["text"] == "hello"
    tp.merge_segment(store, seg("s1", "t1", "hello world", True))  # finalize
    assert store["s1"]["isFinal"] is True and store["s1"]["text"] == "hello world"
    # Final is immutable: later updates/duplicates are ignored.
    tp.merge_segment(store, seg("s1", "t1", "TAMPERED", True))
    tp.merge_segment(store, seg("s1", "t1", "late partial", False))
    assert store["s1"]["text"] == "hello world"
    assert len(store) == 1  # no duplicate rows


# ── reconnect: re-receiving finalized segments is safe ────────────────────────
def test_reconnect_re_receipt_does_not_duplicate_or_mutate():
    store = {}
    tp.merge_segment(store, seg("s1", "t1", "done", True))
    # After a reconnect the provider may replay finalized segments.
    tp.merge_segment(store, seg("s1", "t1", "done", True))
    tp.merge_segment(store, seg("s1", "t1", "changed", True))
    assert len(store) == 1 and store["s1"]["text"] == "done"


# ── late join finalized only + finalize pending ───────────────────────────────
def test_finalized_view_and_finalize_pending():
    store = {}
    tp.merge_segment(store, seg("s1", "t1", "final one", True))
    tp.merge_segment(store, seg("s2", "t2", "still going", False))
    # A late joiner receives finalized segments only.
    assert [s["segmentId"] for s in tp.finalized(store)] == ["s1"]
    # Ending the session finalizes pending segments.
    tp.finalize_pending(store)
    assert store["s2"]["isFinal"] is True
    assert [s["segmentId"] for s in tp.finalized(store)] == ["s1", "s2"]


# ── no persistence / no schema change ─────────────────────────────────────────
def test_no_segment_model_and_no_segment_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert not any(("transcriptsegment" in n or "livetranscript" in n or "segment" in n) for n in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any(("segment" in n or "partial" in n) for n in field_names), field_names
