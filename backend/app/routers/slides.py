"""SVS upload, metadata, DeepZoom tiles, thumbnails, update & delete.

Upload is one-file-per-request so the frontend can show per-file progress via
XHR; a report can hold many slides by issuing several uploads.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require, require_flex
from ..models import Report, Slide, User
from ..rbac import Permission
from ..schemas import SlideOut
from .. import slide_service, storage

router = APIRouter(tags=["slides"])

_ALLOWED_EXT = (".svs", ".tif", ".tiff", ".ndpi", ".scn", ".mrxs", ".svslide", ".vms")
_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400"}


def _get_report(db: Session, org_id: str, report_id: str) -> Report:
    report = db.get(Report, report_id)
    if report is None or report.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return report


def _get_slide(db: Session, org_id: str, slide_id: str) -> Slide:
    slide = db.get(Slide, slide_id)
    if slide is None or slide.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slide not found")
    return slide


@router.post(
    "/reports/{report_id}/slides",
    response_model=SlideOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_slide(
    report_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require(Permission.SLIDE_UPLOAD)),
    db: Session = Depends(get_db),
):
    report = _get_report(db, user.org_id, report_id)

    filename = file.filename or "slide.svs"
    if not filename.lower().endswith(_ALLOWED_EXT):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type. Allowed: {', '.join(_ALLOWED_EXT)}",
        )

    slide = Slide(
        org_id=user.org_id,
        report_id=report.id,
        original_filename=filename,
        stored_path="",
        status="uploading",
        uploaded_by=user.id,
    )
    db.add(slide)
    db.flush()  # get slide.id for the storage path

    try:
        path, size = await storage.save_upload(user.org_id, slide.id, file)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    except Exception:
        db.rollback()
        raise

    slide.stored_path = path
    slide.size_bytes = size
    slide.status = "processing"
    db.commit()
    db.refresh(slide)

    # Extract pyramid metadata (validates the file is a real WSI).
    try:
        meta = slide_service.extract_metadata(path)
        slide.width = meta["width"]
        slide.height = meta["height"]
        slide.level_count = meta["level_count"]
        slide.mpp_x = meta["mpp_x"]
        slide.mpp_y = meta["mpp_y"]
        slide.vendor = meta["vendor"]
        slide.status = "ready"
        slide.error = None
    except slide_service.SlideError as exc:
        slide.status = "error"
        slide.error = str(exc)
        storage.delete_file(path)
    db.commit()
    db.refresh(slide)
    return SlideOut.model_validate(slide)


@router.get("/slides/{slide_id}", response_model=SlideOut)
def get_slide(
    slide_id: str,
    user: User = Depends(require(Permission.SLIDE_VIEW)),
    db: Session = Depends(get_db),
):
    return SlideOut.model_validate(_get_slide(db, user.org_id, slide_id))


@router.get("/slides/{slide_id}/dzi")
def slide_dzi(
    slide_id: str,
    user: User = Depends(require_flex(Permission.SLIDE_VIEW)),
    db: Session = Depends(get_db),
):
    slide = _get_slide(db, user.org_id, slide_id)
    _assert_ready(slide)
    return slide_service.get_dzi(slide.stored_path)


@router.get("/slides/{slide_id}/thumbnail")
def slide_thumbnail(
    slide_id: str,
    user: User = Depends(require(Permission.SLIDE_VIEW)),
    db: Session = Depends(get_db),
):
    slide = _get_slide(db, user.org_id, slide_id)
    _assert_ready(slide)
    data = slide_service.get_thumbnail(slide.stored_path)
    return Response(content=data, media_type="image/jpeg", headers=_CACHE_HEADERS)


@router.get("/slides/{slide_id}/tiles/{level}/{tile}")
def slide_tile(
    slide_id: str,
    level: int,
    tile: str,
    user: User = Depends(require_flex(Permission.SLIDE_VIEW)),
    db: Session = Depends(get_db),
):
    slide = _get_slide(db, user.org_id, slide_id)
    _assert_ready(slide)
    return _tile_response(slide.stored_path, level, tile)


@router.patch("/slides/{slide_id}", response_model=SlideOut)
def update_slide(
    slide_id: str,
    body: dict,
    user: User = Depends(require(Permission.SLIDE_UPDATE)),
    db: Session = Depends(get_db),
):
    slide = _get_slide(db, user.org_id, slide_id)
    # Only the human-facing display name is mutable.
    new_name = body.get("original_filename")
    if isinstance(new_name, str) and new_name.strip():
        slide.original_filename = new_name.strip()
    db.commit()
    db.refresh(slide)
    return SlideOut.model_validate(slide)


@router.delete("/slides/{slide_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_slide(
    slide_id: str,
    user: User = Depends(require(Permission.SLIDE_DELETE)),
    db: Session = Depends(get_db),
):
    slide = _get_slide(db, user.org_id, slide_id)
    slide_service.evict(slide.stored_path)
    storage.delete_file(slide.stored_path)
    db.delete(slide)
    db.commit()


# --------------------------------------------------------------------------- #
# Shared helpers (also used by the public share router)
# --------------------------------------------------------------------------- #
def _assert_ready(slide: Slide) -> None:
    if slide.status != "ready":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Slide is not viewable (status: {slide.status})",
        )


def _parse_tile(tile: str) -> tuple[int, int]:
    """Parse a DeepZoom tile filename like '3_4.jpeg' -> (col=3, row=4)."""
    name = tile.rsplit(".", 1)[0]
    try:
        col_s, row_s = name.split("_")
        return int(col_s), int(row_s)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed tile address") from exc


def _tile_response(path: str, level: int, tile: str) -> Response:
    col, row = _parse_tile(tile)
    try:
        data = slide_service.get_tile(path, level, col, row)
    except slide_service.SlideError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    media = "image/jpeg" if settings.DEEPZOOM_FORMAT == "jpeg" else "image/png"
    return Response(content=data, media_type=media, headers=_CACHE_HEADERS)
