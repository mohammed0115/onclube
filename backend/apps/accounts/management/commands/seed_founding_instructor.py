"""
Seed Hasaballah Hamadain's full public profile as the platform's Founding
Instructor (idempotent). All data lives in the database — nothing is hardcoded in
the app. Data is taken from his CV.

    python manage.py seed_founding_instructor
    python manage.py seed_founding_instructor --avatar-url https://…/photo.jpg
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import (
    InstructorCertification,
    InstructorEducation,
    InstructorExperience,
    InstructorProfile,
    User,
)
from apps.accounts.services_instructor import ensure_slug
from apps.common.enums import UserRole, UserStatus

EMAIL = "hascodaw121@gmail.com"
NAME = "Hasaballah Dawood Hamadain Eisa"

BIO = (
    "Administrative and English-language professional with over 8 years of "
    "experience in office administration, coordination, translation, and "
    "interpretation. Fluent in Arabic and English (American), with strong "
    "reporting, communication, and organizational skills, and a passion for "
    "helping learners speak English with confidence."
)

EDUCATION = [
    dict(degree="Bachelor of Arts — English Language",
         institution="Sudan University of Science and Technology",
         country="Sudan", start_year=2013, end_year=2017),
]

EXPERIENCE = [
    dict(company="Get Solution", position="Liaison Officer",
         description="Liaised with government entities (ZATCA, DGA, Monsha'at), coordinated workflows between engineers and the CEO, and supported client acquisition.",
         from_date="Jan 2026", to_date="Jun 2026"),
    dict(company="Al-Manarat Intermediate School", position="English Language Teacher",
         description="Delivered comprehensive English instruction to intermediate students and developed engaging lesson plans and assessments.",
         from_date="Nov 2024", to_date="Nov 2025"),
    dict(company="Aletegahat Almtadeda Co. Ltd", position="Administrative Assistant",
         description="Optimized daily operations, managed procurement and reporting, coordinated scheduling, and supported team communication.",
         from_date="Mar 2018", to_date="Present"),
    dict(company="Freelance", position="Translator",
         description="Arabic–English translation and interpretation.",
         from_date="2016", to_date="Dec 2017"),
]

CERTIFICATIONS = [
    dict(title="McKinsey Forward Program", issuer="McKinsey & Company", issue_date="2024", credential_url=""),
]


class Command(BaseCommand):
    help = "Seed Hasaballah Hamadain as the Founding Instructor (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--avatar-url", default="")
        parser.add_argument("--password", default="Instructor@12345")

    @transaction.atomic
    def handle(self, *args, **opts):
        user, created = User.objects.get_or_create(
            email=EMAIL,
            defaults={"full_name": NAME, "role": UserRole.INSTRUCTOR, "status": UserStatus.ACTIVE},
        )
        if created:
            user.set_password(opts["password"])
        user.full_name = NAME
        user.role = UserRole.INSTRUCTOR
        user.status = UserStatus.ACTIVE
        user.save()

        profile, _ = InstructorProfile.objects.get_or_create(
            user=user, defaults={"initials": "HH"}
        )
        profile.initials = "HH"
        profile.job_title = "English Conversation & Business Coach"
        profile.headline = "Helping you speak English with confidence"
        profile.bio = BIO
        profile.country = "Sudan"
        profile.city = "Omdurman"
        profile.nationality = "Sudanese"
        profile.flag = "🇸🇩"
        profile.languages = ["Arabic (Native)", "English (Fluent)"]
        profile.specialty = "Conversation & Business English"
        profile.years_experience = 8
        profile.rating = profile.rating or 5.0
        if opts["avatar_url"]:
            profile.avatar_url = opts["avatar_url"]
        # Founding instructor — visible & featured on the landing page.
        profile.founding_instructor = True
        profile.profile_approved = True
        profile.show_on_landing = True
        profile.featured = True
        profile.accept_students = True
        profile.available_for_conversation = True
        profile.available_for_business = True
        profile.available_for_ielts = True
        profile.display_order = 0
        profile.save()
        ensure_slug(profile)

        profile.education.all().delete()
        for i, e in enumerate(EDUCATION):
            InstructorEducation.objects.create(instructor=profile, sort_order=i, **e)
        profile.experience.all().delete()
        for i, x in enumerate(EXPERIENCE):
            InstructorExperience.objects.create(instructor=profile, sort_order=i, **x)
        profile.certifications.all().delete()
        for i, c in enumerate(CERTIFICATIONS):
            InstructorCertification.objects.create(instructor=profile, sort_order=i, **c)

        self.stdout.write(self.style.SUCCESS(
            f"Founding instructor seeded: {NAME} (slug={profile.slug}, "
            f"education={len(EDUCATION)}, experience={len(EXPERIENCE)}, certs={len(CERTIFICATIONS)})"
        ))
