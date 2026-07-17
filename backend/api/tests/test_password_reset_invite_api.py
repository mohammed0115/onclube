"""Forgot-password (request/confirm) + admin invite → set-password flow."""
import pytest
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.models import InstructorProfile, User
from apps.common.enums import UserRole
from apps.common.factories import make_admin, make_instructor, make_student

pytestmark = pytest.mark.django_db


def client_for(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user=user)
    return c


def _uid_token(user):
    return urlsafe_base64_encode(force_bytes(user.pk)), default_token_generator.make_token(user)


def test_reset_request_always_ok_even_for_unknown_email():
    resp = client_for().post("/api/v1/auth/password/reset/", {"email": "ghost@nowhere.io"}, format="json")
    assert resp.status_code == 200 and resp.data["sent"] is True


def test_reset_confirm_sets_new_password():
    student = make_student()
    student.user.set_password("OldPass123!")
    student.user.save()
    uid, token = _uid_token(student.user)
    resp = client_for().post(
        "/api/v1/auth/password/reset/confirm/",
        {"uid": uid, "token": token, "newPassword": "FreshPw98765!"},
        format="json",
    )
    assert resp.status_code == 200
    student.user.refresh_from_db()
    assert student.user.check_password("FreshPw98765!")


def test_reset_confirm_rejects_bad_token():
    student = make_student()
    uid, _ = _uid_token(student.user)
    resp = client_for().post(
        "/api/v1/auth/password/reset/confirm/",
        {"uid": uid, "token": "not-a-real-token", "newPassword": "FreshPw98765!"},
        format="json",
    )
    assert resp.status_code == 400 and resp.data["code"] == "invalid_reset_token"


def test_admin_invites_instructor_creates_inactive_user_and_link():
    admin = make_admin()
    resp = client_for(admin).post(
        "/api/v1/admin/users/invite/",
        {"fullName": "Ivy Newton", "email": "ivy@oneclub.dev", "role": "instructor"},
        format="json",
    )
    assert resp.status_code == 201
    assert "set-password" in resp.data["inviteLink"]
    user = User.objects.get(email="ivy@oneclub.dev")
    assert user.role == UserRole.INSTRUCTOR and user.is_active is False
    assert not user.has_usable_password()
    assert InstructorProfile.objects.filter(user=user).exists()


def test_invited_user_activates_by_setting_password():
    admin = make_admin()
    client_for(admin).post(
        "/api/v1/admin/users/invite/",
        {"fullName": "Ivy Newton", "email": "ivy@oneclub.dev", "role": "instructor"},
        format="json",
    )
    user = User.objects.get(email="ivy@oneclub.dev")
    uid, token = _uid_token(user)
    resp = client_for().post(
        "/api/v1/auth/password/reset/confirm/",
        {"uid": uid, "token": token, "newPassword": "InvitePw2024!"},
        format="json",
    )
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.is_active is True and user.check_password("InvitePw2024!")


def test_non_admin_cannot_invite():
    resp = client_for(make_instructor().user).post(
        "/api/v1/admin/users/invite/",
        {"fullName": "X", "email": "x@y.co", "role": "instructor"},
        format="json",
    )
    assert resp.status_code in (403, 404)
