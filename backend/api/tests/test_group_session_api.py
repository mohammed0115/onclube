"""Community / group-session API — browse upcoming sessions, join and leave."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import CEFRLevel, GroupSessionStatus
from apps.common.factories import make_instructor, make_student
from apps.scheduling.models import GroupSession, GroupSessionAttendee

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def make_group_session(*, capacity=6, days_ahead=2, status=GroupSessionStatus.SCHEDULED):
    inst = make_instructor()
    return GroupSession.objects.create(
        title="Conversation Club",
        description="Practise together.",
        instructor=inst,
        instructor_name=inst.user.full_name,
        level=CEFRLevel.B1,
        start_at=timezone.now() + timedelta(days=days_ahead),
        capacity=capacity,
        status=status,
    )


def test_lists_only_upcoming_scheduled_sessions():
    make_group_session()  # upcoming
    make_group_session(days_ahead=-1)  # past → excluded
    make_group_session(status=GroupSessionStatus.CANCELLED)  # cancelled → excluded
    student = make_student()
    resp = client_for(student.user).get("/api/v1/student/community/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    row = resp.data[0]
    assert row["seatsLeft"] == 6 and row["joined"] is False


def test_join_reserves_a_seat_and_reflects_joined_state():
    gs = make_group_session()
    student = make_student()
    c = client_for(student.user)
    resp = c.post(f"/api/v1/student/community/{gs.id}/join/")
    assert resp.status_code == 201
    assert GroupSessionAttendee.objects.filter(group_session=gs, student=student).count() == 1
    listed = c.get("/api/v1/student/community/").data[0]
    assert listed["joined"] is True and listed["seatsTaken"] == 1 and listed["seatsLeft"] == 5


def test_join_is_idempotent():
    gs = make_group_session()
    student = make_student()
    c = client_for(student.user)
    c.post(f"/api/v1/student/community/{gs.id}/join/")
    c.post(f"/api/v1/student/community/{gs.id}/join/")
    assert GroupSessionAttendee.objects.filter(group_session=gs).count() == 1


def test_cannot_join_a_full_session():
    gs = make_group_session(capacity=1)
    GroupSessionAttendee.objects.create(group_session=gs, student=make_student())
    resp = client_for(make_student().user).post(f"/api/v1/student/community/{gs.id}/join/")
    assert resp.status_code == 409
    assert resp.data["code"] == "group_session_full"


def test_leave_releases_the_seat():
    gs = make_group_session()
    student = make_student()
    c = client_for(student.user)
    c.post(f"/api/v1/student/community/{gs.id}/join/")
    resp = c.delete(f"/api/v1/student/community/{gs.id}/join/")
    assert resp.status_code == 200
    assert GroupSessionAttendee.objects.filter(group_session=gs, student=student).count() == 0


def test_join_unknown_session_is_404():
    resp = client_for(make_student().user).post(
        "/api/v1/student/community/00000000-0000-0000-0000-000000000000/join/"
    )
    assert resp.status_code == 404
    assert resp.data["code"] == "group_session_not_found"
