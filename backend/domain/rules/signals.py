"""
Participant-signal rules (Sprint 8.6).

Pure, transport-neutral business rules for participant signals (raise hand +
reactions). The domain knows NOTHING about WebSocket, RTCDataChannel, Agora RTM,
LiveKit Data, or Daily Events — it only constrains the approved reaction set.
There is no persistence: these rules validate, they do not store.
"""
from domain.exceptions import UnsupportedReaction

# The ONLY approved reactions — no custom emoji / GIF / stickers.
ALLOWED_REACTIONS = ("👍", "👏", "❤️", "❓", "⏳")


def validate_reaction(reaction: str) -> str:
    """Return the reaction if it is one of the approved set, else raise."""
    if reaction not in ALLOWED_REACTIONS:
        raise UnsupportedReaction()
    return reaction
