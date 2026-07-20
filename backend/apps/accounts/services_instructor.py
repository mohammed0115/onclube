"""
Instructor public-profile services: the dynamic landing-page directory, the
public /instructors/{slug} profile, teacher self-service editing, and the admin
controls (approve / feature / visibility / order / founding badge).

All instructor card/profile data comes from the database — nothing is hardcoded.
"""
from django.db import transaction
from django.utils.text import slugify

from apps.common.exceptions import BusinessRuleError

from .models import (
    InstructorCertification,
    InstructorEducation,
    InstructorExperience,
    InstructorProfile,
    InstructorSocialLink,
)

SOCIAL_PLATFORMS = {
    "linkedin", "facebook", "github", "x", "youtube", "instagram", "tiktok", "website",
}


# ── slug ──────────────────────────────────────────────────────────────────────
def ensure_slug(instructor: InstructorProfile) -> str:
    """Assign a unique slug from the teacher's name if one isn't set yet."""
    if instructor.slug:
        return instructor.slug
    base = slugify(instructor.user.full_name) or "instructor"
    slug = base
    i = 2
    while (
        InstructorProfile.objects.filter(slug=slug).exclude(pk=instructor.pk).exists()
    ):
        slug = f"{base}-{i}"
        i += 1
    instructor.slug = slug
    instructor.save(update_fields=["slug", "updated_at"])
    return slug


# ── serialisation ─────────────────────────────────────────────────────────────
def _social(instructor) -> dict:
    return {s.platform: s.url for s in instructor.social_links.all()}


def card_dto(instructor) -> dict:
    """Compact card for the landing page / directory."""
    return {
        "id": str(instructor.id),
        "slug": instructor.slug,
        "fullName": instructor.user.full_name,
        "jobTitle": instructor.job_title or instructor.specialty,
        "headline": instructor.headline,
        "country": instructor.country,
        "flag": instructor.flag,
        "avatarUrl": instructor.avatar_url,
        "rating": float(instructor.rating),
        "sessionsHosted": instructor.sessions_hosted,
        "yearsExperience": instructor.years_experience,
        "specialization": instructor.specialty,
        "featured": instructor.featured,
        "foundingInstructor": instructor.founding_instructor,
        "verified": instructor.profile_approved,
        "acceptStudents": instructor.accept_students,
        "availableFor": {
            "ielts": instructor.available_for_ielts,
            "business": instructor.available_for_business,
            "conversation": instructor.available_for_conversation,
        },
        "socialLinks": _social(instructor),
    }


def full_dto(instructor) -> dict:
    """Full public profile for /instructors/{slug}."""
    data = card_dto(instructor)
    data.update(
        {
            "city": instructor.city,
            "nationality": instructor.nationality,
            "bio": instructor.bio,
            "coverPhotoUrl": instructor.cover_photo_url,
            "introVideoUrl": instructor.intro_video_url,
            "languages": instructor.languages or [],
            "education": [
                {
                    "degree": e.degree, "institution": e.institution, "country": e.country,
                    "startYear": e.start_year, "endYear": e.end_year,
                }
                for e in instructor.education.order_by("sort_order", "-end_year")
            ],
            "experience": [
                {
                    "company": x.company, "position": x.position, "description": x.description,
                    "from": x.from_date, "to": x.to_date,
                }
                for x in instructor.experience.order_by("sort_order")
            ],
            "certifications": [
                {
                    "title": c.title, "issuer": c.issuer, "issueDate": c.issue_date,
                    "credentialUrl": c.credential_url,
                }
                for c in instructor.certifications.order_by("sort_order")
            ],
            "stats": {
                "rating": float(instructor.rating),
                "totalSessions": instructor.sessions_hosted,
                "yearsExperience": instructor.years_experience,
            },
        }
    )
    return data


# ── public queries ────────────────────────────────────────────────────────────
def _public_qs():
    return (
        InstructorProfile.objects.filter(
            profile_approved=True, show_on_landing=True, deleted_at__isnull=True
        )
        .select_related("user")
        .prefetch_related("social_links")
    )


def list_public_instructors() -> list:
    # Sort: featured first, then admin display_order, then rating.
    qs = _public_qs().order_by("-featured", "display_order", "-rating")
    return [card_dto(i) for i in qs]


def get_public_instructor(slug) -> dict:
    instructor = (
        _public_qs()
        .prefetch_related("education", "experience", "certifications")
        .filter(slug=slug)
        .first()
    )
    if instructor is None:
        raise BusinessRuleError("Instructor not found.", code="instructor_not_found")
    return full_dto(instructor)


def own_profile_dto(instructor) -> dict:
    """The teacher's own editable profile (bypasses the public approval gate) —
    full public data plus the editable settings + approval status."""
    data = full_dto(instructor)
    data["settings"] = {
        "showOnLanding": instructor.show_on_landing,
        "acceptStudents": instructor.accept_students,
        "availableForIelts": instructor.available_for_ielts,
        "availableForBusiness": instructor.available_for_business,
        "availableForConversation": instructor.available_for_conversation,
    }
    data["profileApproved"] = instructor.profile_approved
    data["publicUrl"] = f"/instructors/{instructor.slug}" if instructor.slug else None
    return data


# ── teacher self-service ──────────────────────────────────────────────────────
_PROFILE_FIELDS = {
    "job_title", "headline", "bio", "country", "city", "nationality",
    "years_experience", "specialty", "languages", "avatar_url", "cover_photo_url",
    "intro_video_url",
}
_SETTINGS_FIELDS = {
    "show_on_landing", "accept_students",
    "available_for_ielts", "available_for_business", "available_for_conversation",
}


def update_public_profile(instructor, data) -> dict:
    changed = []
    for field in _PROFILE_FIELDS:
        if field in data and data[field] is not None:
            setattr(instructor, field, data[field])
            changed.append(field)
    if changed:
        ensure_slug(instructor)
        changed.append("updated_at")
        instructor.save(update_fields=list(set(changed)))
    else:
        ensure_slug(instructor)
    return full_dto(instructor)


def update_public_settings(instructor, data) -> dict:
    changed = []
    for field in _SETTINGS_FIELDS:
        if field in data and data[field] is not None:
            setattr(instructor, field, bool(data[field]))
            changed.append(field)
    if changed:
        changed.append("updated_at")
        instructor.save(update_fields=changed)
    return {f: getattr(instructor, f) for f in _SETTINGS_FIELDS}


@transaction.atomic
def replace_social_links(instructor, links) -> dict:
    """`links`: [{platform, url}]. Replaces the full set; unknown platforms rejected."""
    instructor.social_links.all().delete()
    for item in links:
        platform = (item.get("platform") or "").lower().strip()
        url = (item.get("url") or "").strip()
        if not url:
            continue
        if platform not in SOCIAL_PLATFORMS:
            raise BusinessRuleError(f"Unknown social platform: {platform}.", code="invalid_platform")
        InstructorSocialLink.objects.create(instructor=instructor, platform=platform, url=url)
    return _social(instructor)


@transaction.atomic
def replace_education(instructor, items) -> list:
    instructor.education.all().delete()
    for i, it in enumerate(items):
        InstructorEducation.objects.create(
            instructor=instructor, degree=it.get("degree", ""), institution=it.get("institution", ""),
            country=it.get("country", ""), start_year=it.get("startYear"), end_year=it.get("endYear"),
            sort_order=i,
        )
    return full_dto(instructor)["education"]


@transaction.atomic
def replace_experience(instructor, items) -> list:
    instructor.experience.all().delete()
    for i, it in enumerate(items):
        InstructorExperience.objects.create(
            instructor=instructor, company=it.get("company", ""), position=it.get("position", ""),
            description=it.get("description", ""), from_date=it.get("from", ""), to_date=it.get("to", ""),
            sort_order=i,
        )
    return full_dto(instructor)["experience"]


@transaction.atomic
def replace_certifications(instructor, items) -> list:
    instructor.certifications.all().delete()
    for i, it in enumerate(items):
        InstructorCertification.objects.create(
            instructor=instructor, title=it.get("title", ""), issuer=it.get("issuer", ""),
            issue_date=it.get("issueDate", ""), credential_url=it.get("credentialUrl", ""),
            sort_order=i,
        )
    return full_dto(instructor)["certifications"]


# ── admin controls ────────────────────────────────────────────────────────────
def admin_card_dto(instructor) -> dict:
    data = card_dto(instructor)
    data.update(
        {
            "showOnLanding": instructor.show_on_landing,
            "profileApproved": instructor.profile_approved,
            "displayOrder": instructor.display_order,
            "email": instructor.user.email,
        }
    )
    return data


def list_all_instructors() -> list:
    qs = (
        InstructorProfile.objects.filter(deleted_at__isnull=True)
        .select_related("user")
        .prefetch_related("social_links")
        .order_by("-featured", "display_order", "-rating")
    )
    return [admin_card_dto(i) for i in qs]


def _get(instructor_id) -> InstructorProfile:
    ins = InstructorProfile.objects.filter(pk=instructor_id).first()
    if ins is None:
        raise BusinessRuleError("Instructor not found.", code="instructor_not_found")
    return ins


def set_approved(instructor_id, approved: bool) -> dict:
    ins = _get(instructor_id)
    ins.profile_approved = bool(approved)
    if approved:
        ensure_slug(ins)
    ins.save(update_fields=["profile_approved", "slug", "updated_at"])
    return admin_card_dto(ins)


def _set_flag(instructor_id, field, value) -> dict:
    ins = _get(instructor_id)
    setattr(ins, field, value)
    ins.save(update_fields=[field, "updated_at"])
    return admin_card_dto(ins)


def set_featured(instructor_id, featured: bool) -> dict:
    return _set_flag(instructor_id, "featured", bool(featured))


def set_visibility(instructor_id, show: bool) -> dict:
    return _set_flag(instructor_id, "show_on_landing", bool(show))


def set_founding(instructor_id, founding: bool) -> dict:
    return _set_flag(instructor_id, "founding_instructor", bool(founding))


def set_display_order(instructor_id, order: int) -> dict:
    return _set_flag(instructor_id, "display_order", max(0, int(order)))
