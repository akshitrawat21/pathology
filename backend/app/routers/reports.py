"""Report CRUD. Every endpoint is org-scoped and permission-guarded."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from ..models import Report, Slide, User
from ..rbac import Permission
from ..schemas import (
    ReportCreate,
    ReportDetailOut,
    ReportOut,
    ReportUpdate,
    SlideOut,
)
from .. import storage, slide_service

router = APIRouter(prefix="/reports", tags=["reports"])


def _get_report(db: Session, org_id: str, report_id: str) -> Report:
    report = db.get(Report, report_id)
    if report is None or report.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return report


@router.get("", response_model=list[ReportOut])
def list_reports(
    user: User = Depends(require(Permission.REPORT_VIEW)), db: Session = Depends(get_db)
):
    counts = dict(
        db.query(Slide.report_id, func.count(Slide.id))
        .filter(Slide.org_id == user.org_id)
        .group_by(Slide.report_id)
        .all()
    )
    reports = (
        db.query(Report)
        .filter(Report.org_id == user.org_id)
        .order_by(Report.updated_at.desc())
        .all()
    )
    out = []
    for r in reports:
        item = ReportOut.model_validate(r)
        item.slide_count = counts.get(r.id, 0)
        out.append(item)
    return out


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    body: ReportCreate,
    user: User = Depends(require(Permission.REPORT_CREATE)),
    db: Session = Depends(get_db),
):
    report = Report(
        org_id=user.org_id,
        title=body.title,
        description=body.description,
        created_by=user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    out = ReportOut.model_validate(report)
    out.slide_count = 0
    return out


@router.get("/{report_id}", response_model=ReportDetailOut)
def get_report(
    report_id: str,
    user: User = Depends(require(Permission.REPORT_VIEW)),
    db: Session = Depends(get_db),
):
    report = _get_report(db, user.org_id, report_id)
    slides = (
        db.query(Slide)
        .filter(Slide.report_id == report.id)
        .order_by(Slide.created_at.asc())
        .all()
    )
    out = ReportDetailOut.model_validate(report)
    out.slide_count = len(slides)
    out.slides = [SlideOut.model_validate(s) for s in slides]
    return out


@router.patch("/{report_id}", response_model=ReportOut)
def update_report(
    report_id: str,
    body: ReportUpdate,
    user: User = Depends(require(Permission.REPORT_EDIT)),
    db: Session = Depends(get_db),
):
    report = _get_report(db, user.org_id, report_id)
    if body.title is not None:
        report.title = body.title
    if body.description is not None:
        report.description = body.description
    db.commit()
    db.refresh(report)
    out = ReportOut.model_validate(report)
    out.slide_count = (
        db.query(func.count(Slide.id)).filter(Slide.report_id == report.id).scalar()
    )
    return out


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: str,
    user: User = Depends(require(Permission.REPORT_DELETE)),
    db: Session = Depends(get_db),
):
    report = _get_report(db, user.org_id, report_id)
    # Clean up slide files on disk before the cascade drops their rows.
    for slide in report.slides:
        slide_service.evict(slide.stored_path)
        storage.delete_file(slide.stored_path)
    db.delete(report)
    db.commit()
