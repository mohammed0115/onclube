"""
Attendance & presence rules (Sprint 8.8).

Pure, provider-neutral state machine for ONE participant's attendance. The domain
knows NOTHING about Video/Presence SDKs — it only accounts for join/leave/heartbeat
timestamps and derives a status. There is no persistence and no media here.

Timestamps are epoch seconds (ints) so the logic is deterministic and testable.

Status:
    absent      — never joined
    present     — currently in the session, joined on time
    late        — currently in the session, joined after the late threshold
    left_early  — left while the session was still running
    completed   — stayed until the session ended
"""
from domain.exceptions import AttendanceLocked

PRESENT = "present"
ABSENT = "absent"
LATE = "late"
LEFT_EARLY = "left_early"
COMPLETED = "completed"

LATE_THRESHOLD_SECONDS = 300  # 5 minutes after the scheduled start


class AttendanceTracker:
    """Accumulates presence for a single participant across reconnects.

    Multiple join/leave cycles merge into ONE record; duration accumulates;
    join/leave are idempotent; once finalized the record is locked.
    """

    def __init__(self, *, participant_id, participant_name, role, scheduled_at):
        self.participant_id = participant_id
        self.participant_name = participant_name
        self.role = role
        self.scheduled_at = scheduled_at
        self.joined_at = None
        self.left_at = None
        self.total_presence_duration = 0
        self.currently_present = False
        self.status = ABSENT
        self._late = False
        self._segment_start = None
        self._locked = False

    def join(self, at):
        if self._locked:
            raise AttendanceLocked()
        if self.currently_present:
            return  # idempotent
        if self.joined_at is None:
            self.joined_at = at
            self._late = at > self.scheduled_at + LATE_THRESHOLD_SECONDS
        self.currently_present = True
        self._segment_start = at
        self.status = LATE if self._late else PRESENT

    def heartbeat(self, at):
        if self._locked:
            raise AttendanceLocked()
        self._accumulate(at)

    def leave(self, at):
        if self._locked:
            raise AttendanceLocked()
        if not self.currently_present:
            return  # idempotent
        self._accumulate(at)
        self.currently_present = False
        self._segment_start = None
        self.left_at = at
        self.status = LEFT_EARLY  # left while the session is still running

    def finalize(self, session_end):
        """Ending the session finalizes and LOCKS attendance. Idempotent."""
        if self._locked:
            return
        if self.currently_present:
            self._accumulate(session_end)
            self.currently_present = False
            self._segment_start = None
        if self.joined_at is None:
            self.status = ABSENT
        elif self.left_at is not None and self.left_at < session_end:
            self.status = LEFT_EARLY
        else:
            self.status = COMPLETED
        self._locked = True

    @property
    def locked(self):
        return self._locked

    @property
    def late(self):
        return self._late

    def _accumulate(self, at):
        if self.currently_present and self._segment_start is not None:
            self.total_presence_duration += max(0, at - self._segment_start)
            self._segment_start = at

    def as_dict(self):
        return {
            "participantId": self.participant_id,
            "participantName": self.participant_name,
            "role": self.role,
            "joinedAt": self.joined_at,
            "leftAt": self.left_at,
            "totalPresenceDuration": self.total_presence_duration,
            "currentlyPresent": self.currently_present,
            "attendanceStatus": self.status,
        }
