"""
File storage gateway — STUB ONLY.

Returns deterministic fake storage keys/urls. The real adapter (S3 / object
store) will implement the same FileStorageGateway port.
"""
import uuid

from application.ports.gateways import FileStorageGateway


class StubFileStorageGateway(FileStorageGateway):
    def save(self, *, filename, content_type, data=None) -> dict:
        # Prefix with a random token so the storage_key is unique even when two
        # uploads share a filename (e.g. two students both upload "receipt.png").
        # File.storage_key is UNIQUE; a deterministic key would raise IntegrityError
        # on the second upload and surface as a confusing 409 to the client.
        key = f"uploads/{uuid.uuid4().hex}/{filename}"
        return {"storage_key": key, "filename": filename, "content_type": content_type}

    def url_for(self, *, storage_key) -> str:
        return f"https://files.local/{storage_key}"
