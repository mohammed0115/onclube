"""
File storage gateway — STUB ONLY.

Returns deterministic fake storage keys/urls. The real adapter (S3 / object
store) will implement the same FileStorageGateway port.
"""
from application.ports.gateways import FileStorageGateway


class StubFileStorageGateway(FileStorageGateway):
    def save(self, *, filename, content_type, data=None) -> dict:
        key = f"uploads/{filename}"
        return {"storage_key": key, "filename": filename, "content_type": content_type}

    def url_for(self, *, storage_key) -> str:
        return f"https://files.local/{storage_key}"
