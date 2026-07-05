"""
Live-transcript pipeline rules (Sprint 8.9).

Pure, provider-neutral rules for a live transcript's SEGMENTS. The domain knows
NOTHING about STT engines (Whisper/Azure/Google/Deepgram/AssemblyAI/AWS) — it only
orders, de-duplicates, and protects segments. It NEVER analyzes them (no AI,
grammar, CEFR, translation, or summary). There is no persistence here.

A "store" is a dict keyed by segmentId; segments are plain dicts with at least
{segmentId, startedAt, isFinal, text}.
"""


def merge_segment(store: dict, segment: dict) -> dict:
    """Insert/update a segment. A FINAL segment is immutable — later updates
    (duplicates or stray partials) for the same id are ignored. Mutates and
    returns the store."""
    existing = store.get(segment["segmentId"])
    if existing is not None and existing.get("isFinal"):
        return store  # final is immutable; duplicate suppression
    store[segment["segmentId"]] = segment
    return store


def ordered(store: dict) -> list:
    """All segments ordered by startedAt (then segmentId for a stable order)."""
    return sorted(store.values(), key=lambda s: (s["startedAt"], s["segmentId"]))


def finalized(store: dict) -> list:
    """Finalized segments only, ordered — what a late joiner receives."""
    return [s for s in ordered(store) if s.get("isFinal")]


def finalize_pending(store: dict) -> dict:
    """Ending the session finalizes any still-partial segments. Mutates/returns."""
    for seg_id, seg in list(store.items()):
        if not seg.get("isFinal"):
            store[seg_id] = {**seg, "isFinal": True}
    return store
