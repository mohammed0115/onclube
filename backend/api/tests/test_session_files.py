"""
In-session file sharing — backend guarantees (Sprint 8.5).

File sharing is a client-transport capability layered on the already-authorized
live session. There is NO file endpoint or permanent storage — the backend's
responsibilities are only (a) the participant gate that governs the room and
(b) the transport-neutral file rule. These tests pin that contract:

  - authorization + participant validation (assigned student/instructor only; admin never)
  - provider abstraction                    (FileStorageGateway port stays neutral)
  - file validation / allowed / blocked / max size
  - no persistence                          (no file model / no field / no migration)
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_joiner
from application.ports.gateways import FileStorageGateway, MeetingTokenProvider, VideoProvider
from domain.exceptions import FileTooLarge, PermissionDenied, UnsupportedFileType
from domain.rules import files as file_rules
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


# ── authorization + participant validation ────────────────────────────────────
def test_only_assigned_participants_may_upload():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    assert ensure_session_joiner(booking.student.user, session) == "student"
    assert ensure_session_joiner(booking.instructor.user, session) == "instructor"

    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_student().user, session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_instructor().user, session)
    with pytest.raises(PermissionDenied):  # admin may NEVER upload
        ensure_session_joiner(make_admin(), session)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_ports_remain_available_and_provider_neutral():
    from abc import ABC

    assert issubclass(FileStorageGateway, ABC)  # storage stays behind a port
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── file validation: allowed / blocked / size / content type ──────────────────
def test_allowed_extensions_accepted():
    for name, ct in [
        ("notes.pdf", "application/pdf"),
        ("slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("plain.txt", "text/plain"),
        ("pic.png", "image/png"),
        ("photo.jpg", "image/jpeg"),
        ("photo.jpeg", "image/jpeg"),
    ]:
        assert file_rules.validate_file(filename=name, size=1024, content_type=ct)["extension"]


def test_blocked_extensions_rejected():
    for name in ("malware.exe", "bundle.zip", "app.apk", "disk.iso", "clip.mp4", "song.mp3"):
        with pytest.raises(UnsupportedFileType):
            file_rules.validate_file(filename=name, size=1024, content_type=None)


def test_content_type_mismatch_rejected():
    with pytest.raises(UnsupportedFileType):
        file_rules.validate_file(filename="notes.pdf", size=1024, content_type="application/x-msdownload")


def test_oversized_and_empty_rejected():
    with pytest.raises(FileTooLarge):
        file_rules.validate_file(filename="big.pdf", size=file_rules.MAX_FILE_SIZE + 1, content_type="application/pdf")
    with pytest.raises(FileTooLarge):
        file_rules.validate_file(filename="empty.pdf", size=0, content_type="application/pdf")
    # Exactly at the limit is allowed.
    assert file_rules.validate_file(filename="ok.pdf", size=file_rules.MAX_FILE_SIZE, content_type="application/pdf")


# ── no persistence / no schema change ─────────────────────────────────────────
def test_no_file_model_and_no_file_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert not any(("sharedfile" in n or "filesh" in n or "sessionfile" in n) for n in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any(("shared_file" in n or "upload" in n or "attachment" in n) for n in field_names), field_names
