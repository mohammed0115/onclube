"""Session rating API — a student rates a completed session; feeds instructor rating."""
import pytest
from rest_framework.test import APIClient

from apps.common.enums import BookingStatus
from apps.common.factories import make_booking, make_student
from apps.scheduling.models import SessionRating

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _completed_booking(student=None):
    b = make_booking(student=student)
    b.status = BookingStatus.COMPLETED
    b.save(update_fields=["status"])
    return b


def test_student_rates_completed_session_and_updates_instructor_rating():
    b = _completed_booking()
    resp = client_for(b.student.user).post(
        f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 5, "comment": "Great!"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["stars"] == 5
    rating = SessionRating.objects.get(booking=b)
    assert rating.stars == 5 and rating.comment == "Great!"
    b.instructor.refresh_from_db()
    assert float(b.instructor.rating) == 5.0


def test_rating_is_idempotent_per_booking_and_reaverages():
    b = _completed_booking()
    c = client_for(b.student.user)
    c.post(f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 5}, format="json")
    c.post(f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 3}, format="json")  # overwrite
    assert SessionRating.objects.filter(booking=b).count() == 1
    b.instructor.refresh_from_db()
    assert float(b.instructor.rating) == 3.0


def test_cannot_rate_a_non_completed_session():
    b = make_booking()  # UPCOMING
    resp = client_for(b.student.user).post(
        f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 5}, format="json"
    )
    assert resp.status_code == 409
    assert resp.data["code"] == "session_not_completed"
    assert SessionRating.objects.count() == 0


def test_cannot_rate_another_students_session():
    b = _completed_booking()
    other = make_student().user
    resp = client_for(other).post(
        f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 5}, format="json"
    )
    assert resp.status_code == 404
    assert SessionRating.objects.count() == 0


def test_stars_out_of_range_rejected():
    b = _completed_booking()
    resp = client_for(b.student.user).post(
        f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 9}, format="json"
    )
    assert resp.status_code in (400, 422)
    assert SessionRating.objects.count() == 0


def test_rating_requires_authentication():
    b = _completed_booking()
    resp = APIClient().post(f"/api/v1/student/bookings/{b.id}/rating/", {"stars": 5}, format="json")
    assert resp.status_code in (401, 403)
