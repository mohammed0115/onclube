"""
In-session chat rules (Sprint 8.3).

Pure, transport-neutral business rules for chat message *content*. The domain
knows NOTHING about how a message is delivered — no WebSocket, RTCDataChannel,
Agora/Daily/LiveKit/Zoom/Twilio, no SDK. It only enforces what a valid message
is. There is no persistence: these rules validate, they do not store.
"""
from domain.exceptions import ChatMessageTooLong, EmptyChatMessage

MAX_MESSAGE_LENGTH = 2000


def validate_message(text: str) -> str:
    """Return the trimmed message text, or raise a domain error.

    Rules: empty / whitespace-only is rejected; length is capped. Any transport
    adapter that ever relays chat can call this to enforce the same invariant.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        raise EmptyChatMessage()
    if len(cleaned) > MAX_MESSAGE_LENGTH:
        raise ChatMessageTooLong()
    return cleaned
