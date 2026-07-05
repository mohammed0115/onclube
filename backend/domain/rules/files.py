"""
File-sharing rules (Sprint 8.5).

Pure, provider-neutral business rules for shared-file *metadata*. The domain knows
NOTHING about browser File objects, blobs, S3, Azure Blob, GCS, or MinIO — it only
validates whether a file is allowed. There is no persistence: these rules validate,
they do not store.
"""
from domain.exceptions import FileTooLarge, UnsupportedFileType

ALLOWED_EXTENSIONS = ("pdf", "docx", "pptx", "txt", "png", "jpg", "jpeg")

# Explicitly blocked (executables/archives/media) — never accepted.
BLOCKED_EXTENSIONS = (
    "exe", "apk", "iso", "zip", "rar", "7z", "dmg", "msi", "bat", "sh",
    "mp4", "mov", "avi", "mkv", "mp3", "wav", "flac", "tar", "gz",
)

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB

ALLOWED_CONTENT_TYPES = {
    "pdf": ("application/pdf",),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation",),
    "txt": ("text/plain",),
    "png": ("image/png",),
    "jpg": ("image/jpeg",),
    "jpeg": ("image/jpeg",),
}


def extension_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def validate_file(*, filename: str, size: int, content_type: str | None = None) -> dict:
    """Return validated metadata, or raise a domain error.

    Rules: extension must be in the allow-list (never in the block-list); size is
    capped; a provided content type must match the extension. Any relaying adapter
    can enforce the same invariant.
    """
    ext = extension_of(filename)
    if ext in BLOCKED_EXTENSIONS or ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileType()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES[ext]:
        raise UnsupportedFileType()
    if size is None or size <= 0 or size > MAX_FILE_SIZE:
        raise FileTooLarge()
    return {"filename": filename, "extension": ext, "size": size, "content_type": content_type}
