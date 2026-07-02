"""SVS sharing.

Two surfaces:
  * Authenticated management (create / list / revoke share links) — guarded by
    the ``slide:share`` permission and org-scoped.
  * A **public** viewer surface (``/shared/{token}``) that needs no login: the
    unguessable token *is* the credential. It exposes only the one slide's
    tiles + minimal metadata — no org, user, or report data leaks.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from ..models import Share, Slide, User
from ..rbac import Permission
from ..schemas import ShareCreate, SharedSlideOut, ShareOut
from .. import slide_service
from .slides import _assert_ready, _tile_response, _CACHE_HEADERS

# --------------------------------------------------------------------------- #
# Authenticated share management
# --------------------------------------------------------------------------- #
router = APIRouter(tags=["shares"])


def _get_slide(db: Session, org_id: str, slide_id: str) -> Slide:
    slide = db.get(Slide, slide_id)
    if slide is None or slide.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slide not found")
    return slide


@router.post(
    "/slides/{slide_id}/shares", response_model=ShareOut, status_code=status.HTTP_201_CREATED
)
def create_share(
    slide_id: str,
    body: ShareCreate,
    user: User = Depends(require(Permission.SLIDE_SHARE)),
    db: Session = Depends(get_db),
):
    slide = _get_slide(db, user.org_id, slide_id)
    expires_at = None
    if body.expires_in_hours:
        from datetime import timedelta

        expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

    share = Share(
        org_id=user.org_id,
        slide_id=slide.id,
        token=secrets.token_urlsafe(24),
        created_by=user.id,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return ShareOut.model_validate(share)


@router.get("/slides/{slide_id}/shares", response_model=list[ShareOut])
def list_shares(
    slide_id: str,
    user: User = Depends(require(Permission.SLIDE_SHARE)),
    db: Session = Depends(get_db),
):
    _get_slide(db, user.org_id, slide_id)
    shares = (
        db.query(Share)
        .filter(Share.slide_id == slide_id, Share.org_id == user.org_id)
        .order_by(Share.created_at.desc())
        .all()
    )
    return [ShareOut.model_validate(s) for s in shares]


@router.delete("/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(
    share_id: str,
    user: User = Depends(require(Permission.SLIDE_SHARE)),
    db: Session = Depends(get_db),
):
    share = db.get(Share, share_id)
    if share is None or share.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    share.revoked = True
    db.commit()


# --------------------------------------------------------------------------- #
# Public shared viewer (no authentication)
# --------------------------------------------------------------------------- #
public_router = APIRouter(prefix="/shared", tags=["public-share"])


def _resolve_share(db: Session, token: str) -> Slide:
    share = db.query(Share).filter(Share.token == token).first()
    if share is None or share.revoked:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link is invalid")
    if share.expires_at is not None:
        exp = share.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_410_GONE, "Share link has expired")
    slide = db.get(Slide, share.slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slide no longer exists")
    return slide


@public_router.get("/{token}", response_model=SharedSlideOut)
def shared_slide(token: str, db: Session = Depends(get_db)):
    slide = _resolve_share(db, token)
    _assert_ready(slide)
    return SharedSlideOut(
        slide_id=slide.id,
        original_filename=slide.original_filename,
        width=slide.width,
        height=slide.height,
        mpp_x=slide.mpp_x,
        mpp_y=slide.mpp_y,
        vendor=slide.vendor,
    )


@public_router.get("/{token}/dzi")
def shared_dzi(token: str, db: Session = Depends(get_db)):
    slide = _resolve_share(db, token)
    _assert_ready(slide)
    return slide_service.get_dzi(slide.stored_path)


@public_router.get("/{token}/thumbnail")
def shared_thumbnail(token: str, db: Session = Depends(get_db)):
    from fastapi import Response

    slide = _resolve_share(db, token)
    _assert_ready(slide)
    data = slide_service.get_thumbnail(slide.stored_path)
    return Response(content=data, media_type="image/jpeg", headers=_CACHE_HEADERS)


@public_router.get("/{token}/tiles/{level}/{tile}")
def shared_tile(token: str, level: int, tile: str, db: Session = Depends(get_db)):
    slide = _resolve_share(db, token)
    _assert_ready(slide)
    return _tile_response(slide.stored_path, level, tile)
