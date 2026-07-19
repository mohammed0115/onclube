"""
Provision a live session that an instructor and a student can JOIN RIGHT NOW,
so you can test the real Agora video room end-to-end.

Usage:
    python manage.py seed_live_session
    python manage.py seed_live_session --instructor-email hascodaw121@gmail.com \
        --student-email teststudent@oneclub.local --student-password 'Student@12345'

What it does (idempotent on the accounts):
  - ensures the instructor account (+ InstructorProfile)
  - ensures a student account (+ active subscription so booking is allowed)
  - creates a published topic + an availability slot AT NOW
  - books it (real booking service) -> creates the Session room
  - sets the schedule to now so the 15-min join window is already open

Then log in as each account and open /student/session/<booking-id>.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User, InstructorProfile, StudentProfile
from apps.billing.models import Plan, Subscription
from apps.common.enums import UserRole, UserStatus, CEFRLevel, SubscriptionStatus, SessionStatus
from apps.scheduling.models import AvailabilitySlot
from apps.scheduling.services import create_booking
from apps.sessions.models import Session
from apps.common.factories import make_topic


def _ensure_instructor(email, name, password):
    user, created = User.objects.get_or_create(
        email=email.strip().lower(),
        defaults=dict(full_name=name, role=UserRole.INSTRUCTOR, status=UserStatus.ACTIVE, is_active=True),
    )
    if not created and user.role != UserRole.INSTRUCTOR:
        user.role = UserRole.INSTRUCTOR
        user.save(update_fields=["role"])
    # A brand-new account (or one without a usable password) needs a login password.
    if created or not user.has_usable_password():
        user.set_password(password)
        user.save(update_fields=["password"])
    profile, _ = InstructorProfile.objects.get_or_create(
        user=user, defaults={"initials": "".join(w[0] for w in name.split()[:2]).upper() or "IN"}
    )
    return profile


def _ensure_student(email, password, name):
    user = User.objects.filter(email=email.strip().lower()).first()
    if user is None:
        user = User.objects.create_user(
            email=email.strip().lower(), password=password, full_name=name, role=UserRole.STUDENT
        )
    profile, _ = StudentProfile.objects.get_or_create(user=user, defaults={"level": CEFRLevel.B1})
    return profile


def _ensure_active_subscription(student, sessions=999):
    plan = Plan.objects.filter(active=True).order_by("price").first()
    if plan is None:
        plan = Plan.objects.create(
            code="test-live", name="Test Live", price="0", currency="SDG",
            sessions_per_month=999, billing_period_days=365, active=True,
        )
    now = timezone.now()
    sub = Subscription.objects.filter(student=student, status=SubscriptionStatus.ACTIVE).first()
    if sub is None:
        sub = Subscription.objects.create(
            student=student, plan=plan, status=SubscriptionStatus.ACTIVE,
            started_at=now, expires_at=now + timedelta(days=365), sessions_remaining=sessions,
        )
    else:
        sub.sessions_remaining = sessions
        sub.expires_at = now + timedelta(days=365)
        sub.save(update_fields=["sessions_remaining", "expires_at"])
    student.active_subscription = sub
    student.sessions_remaining = sessions
    student.save(update_fields=["active_subscription", "sessions_remaining"])
    return sub


class Command(BaseCommand):
    help = "Create a live session joinable right now (instructor + student) for video testing."

    def add_arguments(self, parser):
        parser.add_argument("--instructor-email", default="hascodaw121@gmail.com")
        parser.add_argument("--instructor-name", default="Hasco Instructor")
        parser.add_argument("--instructor-password", default="Instructor@12345")
        parser.add_argument("--student-email", default="teststudent@oneclub.local")
        parser.add_argument("--student-password", default="Student@12345")
        parser.add_argument("--student-name", default="Test Student")
        parser.add_argument("--base-url", default="https://oneclup.com")

    @transaction.atomic
    def handle(self, *args, **opts):
        instructor = _ensure_instructor(opts["instructor_email"], opts["instructor_name"], opts["instructor_password"])
        student = _ensure_student(opts["student_email"], opts["student_password"], opts["student_name"])
        _ensure_active_subscription(student)

        topic = make_topic(instructor, published=True, with_approved_question=True)

        now = timezone.now()
        slot = AvailabilitySlot.objects.create(instructor=instructor, start_at=now)
        booking = create_booking(student, topic, slot)

        # Ensure the schedule is "now" so the join window (opens 15 min before) is open.
        booking.scheduled_at = now
        booking.save(update_fields=["scheduled_at"])
        slot.start_at = now
        slot.save(update_fields=["start_at"])

        session = Session.objects.filter(booking=booking).first()
        if session is None:
            session = Session.objects.create(booking=booking, status=SessionStatus.SCHEDULED)

        base = opts["base_url"].rstrip("/")
        url = f"{base}/student/session/{booking.id}"
        self.stdout.write(self.style.SUCCESS("\n✅ Live session ready — joinable NOW (15-min window open).\n"))
        self.stdout.write(f"  Session id : {session.id}")
        self.stdout.write(f"  Booking id : {booking.id}")
        self.stdout.write(f"  Topic      : {topic.title}\n")
        self.stdout.write(self.style.HTTP_INFO("  INSTRUCTOR:"))
        self.stdout.write(f"    email    : {instructor.user.email}")
        self.stdout.write(f"    password : {opts['instructor_password']}  (only if newly created)")
        self.stdout.write(f"    open     : {url}   (or Dashboard → Open room)\n")
        self.stdout.write(self.style.HTTP_INFO("  STUDENT:"))
        self.stdout.write(f"    email    : {student.user.email}")
        self.stdout.write(f"    password : {opts['student_password']}")
        self.stdout.write(f"    open     : {url}   (or Dashboard → Join room)\n")
        self.stdout.write("  Both open the URL → Start/Join → talk over Agora. 🎥\n")
