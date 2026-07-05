"""
Permission boundary for the application layer.

Use cases call these helpers to authorize the actor BEFORE touching domain rules
or repositories. They raise domain.PermissionDenied (a BusinessRuleError) on
failure. This keeps authorization out of the presentation layer.
"""
from apps.common.enums import UserRole
from domain.exceptions import PermissionDenied


def ensure_admin(actor):
    if actor is None or getattr(actor, "role", None) != UserRole.ADMIN:
        raise PermissionDenied("Admin role required.")
    return actor


def get_student_profile(actor):
    """Return the actor's StudentProfile or raise PermissionDenied."""
    if actor is None:
        raise PermissionDenied()
    profile = getattr(actor, "student_profile", None)
    if profile is None:
        raise PermissionDenied("A student profile is required for this action.")
    return profile


def get_instructor_profile(actor):
    if actor is None:
        raise PermissionDenied()
    profile = getattr(actor, "instructor_profile", None)
    if profile is None:
        raise PermissionDenied("An instructor profile is required for this action.")
    return profile


def ensure_student_owns(actor, student_profile):
    """Allow the owning student, or an admin acting on their behalf."""
    if actor is not None and getattr(actor, "role", None) == UserRole.ADMIN:
        return actor
    if actor is None or student_profile.user_id != actor.id:
        raise PermissionDenied("You can only act on your own student account.")
    return actor


def ensure_session_participant(actor, session):
    """The booked student or the assigned instructor (or an admin). Read-scope."""
    if actor is not None and getattr(actor, "role", None) == UserRole.ADMIN:
        return actor
    booking = session.booking
    if actor is not None and (
        booking.student.user_id == actor.id or booking.instructor.user_id == actor.id
    ):
        return actor
    raise PermissionDenied("Only a session participant may perform this action.")


def session_joiner_role(actor, session):
    """"student" / "instructor" for the ASSIGNED participant, else None.

    Deliberately NO admin bypass — an administrator is not a session participant
    and may not join/leave/start/end a live session.
    """
    booking = session.booking
    if actor is not None and booking.student.user_id == actor.id:
        return "student"
    if actor is not None and booking.instructor.user_id == actor.id:
        return "instructor"
    return None


def ensure_session_joiner(actor, session):
    """Only the assigned student or instructor may act on the live session."""
    role = session_joiner_role(actor, session)
    if role is None:
        raise PermissionDenied("Only the assigned student or instructor may join this session.")
    return role


def ensure_session_recorder(actor, session):
    """Only the assigned INSTRUCTOR may control recording. Students and admins are
    rejected (admin is not a participant; a student may not record)."""
    role = session_joiner_role(actor, session)
    if role != "instructor":
        raise PermissionDenied("Only the assigned instructor may control recording.")
    return role


def _is_admin(actor):
    return actor is not None and getattr(actor, "role", None) == UserRole.ADMIN


def ensure_booking_viewer(actor, booking):
    """The owning student, the assigned instructor, or an admin may read a booking."""
    if _is_admin(actor):
        return actor
    if actor is not None and (
        booking.student.user_id == actor.id or booking.instructor.user_id == actor.id
    ):
        return actor
    raise PermissionDenied("You cannot view this booking.")


def ensure_report_viewer(actor, report):
    """The report's student, its instructor, or an admin may read an AI report."""
    if _is_admin(actor):
        return actor
    if actor is not None and (
        report.student.user_id == actor.id
        or report.booking.instructor.user_id == actor.id
    ):
        return actor
    raise PermissionDenied("You cannot view this report.")


def ensure_instructor_owns_topic(actor, topic):
    """Only the owning instructor (or an admin) may read/manage a topic's internals."""
    if _is_admin(actor):
        return actor
    instructor = get_instructor_profile(actor)
    if topic.instructor_id != instructor.id:
        raise PermissionDenied("You can only access your own topics.")
    return actor


def ensure_notification_owner(actor, notification):
    if _is_admin(actor):
        return actor
    if actor is None or notification.user_id != actor.id:
        raise PermissionDenied("You can only access your own notifications.")
    return actor
