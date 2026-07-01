"""
accounts — identity (custom User) and the student/instructor profiles.

Maps database design tables: users, student_profiles, instructor_profiles.
"""
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.enums import (
    CEFRLevel,
    PaymentStatus,
    UserRole,
    UserStatus,
)
from apps.common.models import BaseModel, SoftDeleteModel, TimeStampedModel


class UserManager(BaseUserManager):
    """Email-based manager (no username field)."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("role", UserRole.STUDENT)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", UserRole.ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if extra["is_staff"] is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra["is_superuser"] is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin, SoftDeleteModel):
    """Base identity for every role. Email is the login id."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(max_length=254, unique=True)
    role = models.CharField(
        max_length=20, choices=UserRole.choices, default=UserRole.STUDENT
    )
    status = models.CharField(
        max_length=20, choices=UserStatus.choices, default=UserStatus.ACTIVE
    )

    # Django admin / auth plumbing.
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["role"]),
            models.Index(
                fields=["status"],
                name="user_suspended_idx",
                condition=models.Q(status=UserStatus.SUSPENDED),
            ),
        ]

    def __str__(self):
        return f"{self.full_name} <{self.email}> ({self.role})"

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


class StudentProfile(BaseModel, SoftDeleteModel):
    """1:1 with a student User. Carries denormalized payment/session mirrors."""

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="student_profile"
    )
    level = models.CharField(
        max_length=2, choices=CEFRLevel.choices, null=True, blank=True
    )
    goal = models.ForeignKey(
        "onboarding.Goal",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="students",
    )
    placement_result = models.ForeignKey(
        "onboarding.PlacementResult",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    active_subscription = models.ForeignKey(
        "billing.Subscription",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.NONE
    )
    sessions_remaining = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "student_profiles"
        constraints = [
            models.CheckConstraint(
                check=models.Q(sessions_remaining__gte=0),
                name="chk_student_sessions_nonneg",
            ),
        ]

    def __str__(self):
        return f"StudentProfile<{self.user.full_name}>"


class InstructorProfile(BaseModel, SoftDeleteModel):
    """1:1 with an instructor User."""

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="instructor_profile"
    )
    initials = models.CharField(max_length=4)
    flag = models.CharField(max_length=8, null=True, blank=True)
    country = models.CharField(max_length=80, null=True, blank=True)
    headline = models.CharField(max_length=160, null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    rating = models.DecimalField(max_digits=2, decimal_places=1, default=0)
    sessions_hosted = models.PositiveIntegerField(default=0)
    accent = models.CharField(max_length=60, null=True, blank=True)

    class Meta:
        db_table = "instructor_profiles"
        indexes = [models.Index(fields=["-rating"])]
        constraints = [
            models.CheckConstraint(
                check=models.Q(rating__gte=0) & models.Q(rating__lte=5),
                name="chk_instructor_rating_range",
            ),
        ]

    def clean(self):
        if self.rating is not None and not (0 <= self.rating <= 5):
            raise ValidationError({"rating": "Rating must be between 0 and 5."})

    def __str__(self):
        return f"InstructorProfile<{self.user.full_name}>"
