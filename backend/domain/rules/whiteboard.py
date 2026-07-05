"""
Whiteboard rules (Sprint 8.4).

Pure, provider-neutral business rules for whiteboard *operations*. The domain
knows NOTHING about Canvas, Excalidraw, tldraw, Fabric, Konva, or any rendering
engine — it only validates the shape of an operation. There is no persistence:
these rules validate, they do not store.

Operations are resolution-independent (points normalised to 0..1) so they never
carry Canvas objects or pixel geometry tied to a device.
"""
from domain.exceptions import InvalidWhiteboardOperation

VALID_STROKE_TOOLS = ("pen", "eraser")
MAX_POINTS = 20000


def _valid_point(p) -> bool:
    try:
        return 0.0 <= float(p["x"]) <= 1.0 and 0.0 <= float(p["y"]) <= 1.0
    except (KeyError, TypeError, ValueError):
        return False


def validate_operation(op: dict) -> dict:
    """Return the operation if valid, else raise InvalidWhiteboardOperation.

    Accepted operation types:
      * ``clear``  — {type, id, authorId}
      * ``stroke`` — {type, id, authorId, tool, color, width, points[]}
    Any transport that relays whiteboard ops can enforce the same invariant.
    """
    if not isinstance(op, dict):
        raise InvalidWhiteboardOperation()

    op_type = op.get("type")
    if op_type == "clear":
        return op

    if op_type == "stroke":
        if op.get("tool") not in VALID_STROKE_TOOLS:
            raise InvalidWhiteboardOperation()
        points = op.get("points")
        if not isinstance(points, list) or not points or len(points) > MAX_POINTS:
            raise InvalidWhiteboardOperation()
        if not all(_valid_point(p) for p in points):
            raise InvalidWhiteboardOperation()
        return op

    raise InvalidWhiteboardOperation()
