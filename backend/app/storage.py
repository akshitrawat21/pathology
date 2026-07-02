"""File storage abstraction (local filesystem driver).

Kept behind a tiny interface so it can be swapped for S3/GCS later without
touching the routers. Files are namespaced by organization for isolation:
``<STORAGE_DIR>/<org_id>/<slide_id><ext>``.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import UploadFile

from .config import settings

# Read uploads in chunks so a multi-GB slide never lands in memory.
_CHUNK = 8 * 1024 * 1024  # 8 MB


def _slide_path(org_id: str, slide_id: str, original_filename: str) -> Path:
    ext = Path(original_filename).suffix.lower() or ".svs"
    org_dir = settings.storage_path / org_id
    org_dir.mkdir(parents=True, exist_ok=True)
    return org_dir / f"{slide_id}{ext}"


async def save_upload(org_id: str, slide_id: str, upload: UploadFile) -> tuple[str, int]:
    """Stream an UploadFile to disk. Returns (absolute_path, size_bytes)."""
    dest = _slide_path(org_id, slide_id, upload.filename or "slide.svs")
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await upload.read(_CHUNK)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise ValueError("File exceeds maximum allowed size")
            out.write(chunk)
    return str(dest), size


def delete_file(path: str) -> None:
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass


def delete_org_dir(org_id: str) -> None:
    shutil.rmtree(settings.storage_path / org_id, ignore_errors=True)
