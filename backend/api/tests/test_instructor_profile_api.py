"""Instructor profile (read/edit) + change-password API."""
import pytest
from rest_framework.test import APIClient

from apps.common.factories import make_instructor, make_student

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_instructor_reads_own_profile():
    inst = make_instructor()
    resp = client_for(inst.user).get("/api/v1/instructor/profile/")
    assert resp.status_code == 200
    assert resp.data["email"] == inst.user.email
    assert resp.data["languages"] == [] and resp.data["yearsExperience"] == 0


def test_instructor_edits_profile_fields():
    inst = make_instructor()
    resp = client_for(inst.user).patch(
        "/api/v1/instructor/profile/",
        {
            "fullName": "Nora Kamal",
            "headline": "IELTS specialist",
            "bio": "10 years teaching.",
            "languages": ["English", "Arabic"],
            "interests": ["Debate", "Travel"],
            "yearsExperience": 10,
            "specialty": "Exam prep",
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["fullName"] == "Nora Kamal"
    assert resp.data["languages"] == ["English", "Arabic"]
    assert resp.data["yearsExperience"] == 10
    inst.refresh_from_db()
    assert inst.headline == "IELTS specialist" and inst.years_experience == 10
    inst.user.refresh_from_db()
    assert inst.user.full_name == "Nora Kamal"


def test_student_cannot_use_instructor_profile_endpoint():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/instructor/profile/")
    assert resp.status_code in (403, 404)


def test_change_password_success_then_new_password_works():
    inst = make_instructor()
    inst.user.set_password("OldPass123!")
    inst.user.save()
    c = client_for(inst.user)
    resp = c.post(
        "/api/v1/me/password/",
        {"currentPassword": "OldPass123!", "newPassword": "BrandNewPw456!"},
        format="json",
    )
    assert resp.status_code == 200 and resp.data["changed"] is True
    inst.user.refresh_from_db()
    assert inst.user.check_password("BrandNewPw456!")


def test_change_password_rejects_wrong_current():
    inst = make_instructor()
    inst.user.set_password("OldPass123!")
    inst.user.save()
    resp = client_for(inst.user).post(
        "/api/v1/me/password/",
        {"currentPassword": "wrong", "newPassword": "BrandNewPw456!"},
        format="json",
    )
    assert resp.status_code == 422
    assert resp.data["code"] == "invalid_current_password"


def test_change_password_rejects_weak_new_password():
    inst = make_instructor()
    inst.user.set_password("OldPass123!")
    inst.user.save()
    resp = client_for(inst.user).post(
        "/api/v1/me/password/",
        {"currentPassword": "OldPass123!", "newPassword": "12345678"},
        format="json",
    )
    assert resp.status_code == 422
    assert resp.data["code"] == "weak_password"
