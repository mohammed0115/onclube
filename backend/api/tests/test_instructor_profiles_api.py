"""
Dynamic instructor profiles — public directory, public profile, teacher
self-service, and admin controls.
"""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import InstructorProfile
from apps.accounts.services_instructor import ensure_slug
from apps.common.factories import make_admin, make_instructor, make_student

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _public_instructor(*, name_seed, featured=False, order=0, rating=4, founding=False):
    ins = make_instructor()
    ins.user.full_name = f"Teacher {name_seed}"
    ins.user.save(update_fields=["full_name"])
    ins.profile_approved = True
    ins.show_on_landing = True
    ins.featured = featured
    ins.founding_instructor = founding
    ins.display_order = order
    ins.rating = rating
    ins.job_title = "Conversation Coach"
    ins.country = "Sudan"
    ins.save()
    ensure_slug(ins)
    return ins


# ── public directory ──────────────────────────────────────────────────────────
def test_public_list_is_open_and_sorted_featured_then_order_then_rating():
    a = _public_instructor(name_seed="A", featured=False, order=2, rating=5)
    b = _public_instructor(name_seed="B", featured=True, order=9, rating=3)   # featured → first
    c = _public_instructor(name_seed="C", featured=False, order=1, rating=4)

    resp = APIClient().get("/api/v1/instructors/")  # no auth required
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.data]
    assert ids[0] == str(b.id)                 # featured first
    assert ids.index(str(c.id)) < ids.index(str(a.id))  # order 1 before order 2


def test_public_list_excludes_unapproved_or_hidden():
    visible = _public_instructor(name_seed="V")
    hidden = make_instructor()
    hidden.profile_approved = True
    hidden.show_on_landing = False
    hidden.save()
    unapproved = make_instructor()
    unapproved.profile_approved = False
    unapproved.show_on_landing = True
    unapproved.save()

    ids = [r["id"] for r in APIClient().get("/api/v1/instructors/").data]
    assert str(visible.id) in ids
    assert str(hidden.id) not in ids and str(unapproved.id) not in ids


def test_public_profile_by_slug_returns_full_data():
    ins = _public_instructor(name_seed="Slug", founding=True)
    resp = APIClient().get(f"/api/v1/instructors/{ins.slug}/")
    assert resp.status_code == 200
    assert resp.data["fullName"] == ins.user.full_name
    assert resp.data["foundingInstructor"] is True
    for key in ("education", "experience", "certifications", "languages", "stats", "socialLinks"):
        assert key in resp.data


def test_unknown_slug_is_rejected():
    assert APIClient().get("/api/v1/instructors/nobody-here/").status_code == 422


# ── teacher self-service ──────────────────────────────────────────────────────
def test_teacher_updates_profile_settings_and_social_links():
    ins = make_instructor()
    c = client_for(ins.user)

    p = c.put("/api/v1/instructor/public-profile/", {"jobTitle": "IELTS Instructor", "city": "Omdurman", "yearsExperience": 6}, format="json")
    assert p.status_code == 200 and p.data["jobTitle"] == "IELTS Instructor"

    s = c.put("/api/v1/instructor/public-settings/", {"availableForIelts": True, "showOnLanding": False}, format="json")
    assert s.status_code == 200 and s.data["available_for_ielts"] is True and s.data["show_on_landing"] is False

    l = c.put("/api/v1/instructor/social-links/", {"links": [{"platform": "linkedin", "url": "https://linkedin.com/in/x"}]}, format="json")
    assert l.status_code == 200 and l.data["linkedin"] == "https://linkedin.com/in/x"

    ins.refresh_from_db()
    assert ins.job_title == "IELTS Instructor" and ins.slug  # slug auto-assigned


def test_teacher_reads_own_profile_and_builds_cv():
    ins = make_instructor()
    c = client_for(ins.user)

    # Own profile is readable even before admin approval.
    own = c.get("/api/v1/instructor/public-profile/")
    assert own.status_code == 200
    assert "settings" in own.data and own.data["profileApproved"] is False

    # Build the CV: education + experience + certifications.
    c.put("/api/v1/instructor/education/", {"items": [
        {"degree": "BA English", "institution": "Khartoum U", "country": "Sudan", "startYear": 2013, "endYear": 2017},
    ]}, format="json")
    c.put("/api/v1/instructor/experience/", {"items": [
        {"company": "School", "position": "Teacher", "description": "Taught English.", "from": "2018", "to": "Present"},
    ]}, format="json")
    r = c.put("/api/v1/instructor/certifications/", {"items": [
        {"title": "CELTA", "issuer": "Cambridge", "issueDate": "2020", "credentialUrl": ""},
    ]}, format="json")
    assert r.status_code == 200

    again = c.get("/api/v1/instructor/public-profile/").data
    assert len(again["education"]) == 1 and again["education"][0]["degree"] == "BA English"
    assert len(again["experience"]) == 1 and again["experience"][0]["position"] == "Teacher"
    assert len(again["certifications"]) == 1 and again["certifications"][0]["title"] == "CELTA"


def test_teacher_rejects_unknown_social_platform():
    ins = make_instructor()
    r = client_for(ins.user).put(
        "/api/v1/instructor/social-links/", {"links": [{"platform": "myspace", "url": "https://x"}]}, format="json"
    )
    assert r.status_code == 422 and r.data["code"] == "invalid_platform"


# ── admin controls ────────────────────────────────────────────────────────────
def test_admin_can_approve_feature_and_set_founding():
    admin = make_admin()
    ins = make_instructor()
    c = client_for(admin)

    a = c.patch(f"/api/v1/admin/instructors/{ins.id}/approve/", {"approved": True}, format="json")
    assert a.status_code == 200 and a.data["profileApproved"] is True and a.data["slug"]

    f = c.patch(f"/api/v1/admin/instructors/{ins.id}/feature/", {"featured": True}, format="json")
    assert f.data["featured"] is True

    fo = c.patch(f"/api/v1/admin/instructors/{ins.id}/founding/", {"founding": True}, format="json")
    assert fo.data["foundingInstructor"] is True

    o = c.patch(f"/api/v1/admin/instructors/{ins.id}/display-order/", {"displayOrder": 3}, format="json")
    assert o.data["displayOrder"] == 3


def test_admin_instructor_endpoints_are_admin_only():
    student = make_student()
    ins = make_instructor()
    assert client_for(student.user).get("/api/v1/admin/instructors/").status_code == 403
