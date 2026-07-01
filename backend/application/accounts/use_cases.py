"""Account command use cases — registration and self profile update."""
from django.db import IntegrityError, transaction

from apps.accounts.models import StudentProfile, User
from apps.common.enums import UserRole
from application import mappers
from domain import events as domain_events
from domain.dtos import UserProfileResult
from domain.exceptions import EmailAlreadyRegistered, PermissionDenied
from infrastructure.container import default_event_bus


class RegisterStudentUseCase:
    """Public — creates a student User + StudentProfile. No tokens issued here."""

    def __init__(self, *, events=None):
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor=None, full_name, email, password) -> UserProfileResult:
        email_norm = (email or "").strip().lower()
        if User.objects.filter(email=email_norm).exists():
            raise EmailAlreadyRegistered()
        try:
            user = User.objects.create_user(
                email=email_norm,
                password=password,
                full_name=full_name,
                role=UserRole.STUDENT,
            )
        except IntegrityError:  # unique race backstop
            raise EmailAlreadyRegistered()

        student = StudentProfile.objects.create(user=user)
        self.events.publish(
            domain_events.StudentRegistered(user_id=str(user.id), student_id=str(student.id))
        )
        return mappers.user_profile(user, student=student)


class UpdateCurrentProfileUseCase:
    """The authenticated actor updates their own display name."""

    def execute(self, *, actor, full_name=None) -> UserProfileResult:
        if actor is None:
            raise PermissionDenied()
        if full_name is not None:
            actor.full_name = full_name
            actor.save(update_fields=["full_name", "updated_at"])
        student = getattr(actor, "student_profile", None)
        instructor = getattr(actor, "instructor_profile", None)
        return mappers.user_profile(actor, student=student, instructor=instructor)
