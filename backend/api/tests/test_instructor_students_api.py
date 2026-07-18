"""Part 3 — instructor students list + per-student prep view."""
import pytest
from rest_framework.test import APIClient

from apps.common.factories import make_booking, make_slot
from apps.scheduling.services import create_booking

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_instructor_lists_distinct_students():
    b = make_booking()
    # a second booking for the SAME student + instructor (reuse the active sub)
    create_booking(b.student, b.topic, make_slot(b.instructor, days_ahead=5))
    resp = client_for(b.instructor.user).get("/api/v1/instructor/students/")
    assert resp.status_code == 200
    assert len(resp.data) == 1  # distinct
    assert resp.data[0]["sessions"] == 2
    assert {"id", "fullName", "level", "sessions", "completed", "lastScore"} <= set(resp.data[0].keys())


def test_instructor_views_own_student_detail():
    b = make_booking()
    resp = client_for(b.instructor.user).get(f"/api/v1/instructor/students/{b.student.id}/")
    assert resp.status_code == 200
    assert resp.data["id"] == str(b.student.id)
    assert len(resp.data["sessions"]) == 1


def test_instructor_cannot_view_other_instructors_student():
    b = make_booking()
    other = make_booking()  # different instructor + student
    resp = client_for(other.instructor.user).get(f"/api/v1/instructor/students/{b.student.id}/")
    assert resp.status_code in (403, 404)
