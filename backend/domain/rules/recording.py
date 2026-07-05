"""
Session-recording rules (Sprint 8.7).

Pure, provider-neutral state machine for a session recording. The domain knows
NOTHING about Agora Cloud Recording, Daily, Zoom, LiveKit Egress, or FFmpeg — it
only governs the lifecycle:

    idle → recording → processing → completed
                    ↘ cancelled
             (any active) → failed

Start/stop are idempotent; there is at most one active recording per session; a
cancelled recording cannot resume. There is NO persistence and NO media handling
here — these functions validate/transition metadata state only.
"""
from domain.exceptions import InvalidRecordingTransition

IDLE = "idle"
RECORDING = "recording"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"
CANCELLED = "cancelled"

TERMINAL = (COMPLETED, FAILED, CANCELLED)
_STARTABLE = (None, IDLE, COMPLETED, FAILED, CANCELLED)


def can_start(status) -> bool:
    return status in _STARTABLE or status == RECORDING


def start(status):
    """Begin recording. Idempotent: starting while already recording is a no-op
    (single active recording per session)."""
    if status == RECORDING:
        return RECORDING
    if status == PROCESSING:
        raise InvalidRecordingTransition()  # a stop is finalizing; cannot start a new one yet
    if status not in _STARTABLE:
        raise InvalidRecordingTransition()
    return RECORDING


def stop(status):
    """Stop recording → processing. Idempotent for processing/completed."""
    if status in (PROCESSING, COMPLETED):
        return status
    if status != RECORDING:
        raise InvalidRecordingTransition()
    return PROCESSING


def cancel(status):
    """Cancel an active recording. Idempotent for an already-cancelled one; a
    cancelled recording cannot resume."""
    if status == CANCELLED:
        return CANCELLED
    if status != RECORDING:
        raise InvalidRecordingTransition()
    return CANCELLED


def finalize(status):
    """Ending the session finalizes an active recording (→ processing)."""
    if status == RECORDING:
        return PROCESSING
    return status
