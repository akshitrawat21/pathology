"""SQLAlchemy ORM models.

Multi-tenancy strategy: **shared database, shared schema, row-level scoping**.
Every tenant-owned row carries an ``org_id`` FK, and every query in the API is
filtered by the caller's ``org_id`` (enforced centrally in the dependency layer
and repository helpers). This is the simplest model to operate while still
providing complete logical isolation between organizations.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .rbac import Role


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    users: Mapped[list["User"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    picture: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Set the first time the user actually authenticates via Google.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)

    role: Mapped[str] = mapped_column(String(20), default=Role.MEMBER.value)
    permissions: Mapped[list] = mapped_column(JSON, default=list)

    # "invited"  -> created by an admin, has not signed in yet (google_sub is NULL)
    # "active"   -> has completed Google Sign-In at least once
    status: Mapped[str] = mapped_column(String(20), default="invited")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization: Mapped["Organization"] = relationship(back_populates="users")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    organization: Mapped["Organization"] = relationship(back_populates="reports")
    slides: Mapped[list["Slide"]] = relationship(back_populates="report", cascade="all, delete-orphan")


class Slide(Base):
    """A Whole Slide Image (.svs) attached to a report."""

    __tablename__ = "slides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)

    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

    # "uploading" -> "processing" -> "ready" | "error"
    status: Mapped[str] = mapped_column(String(20), default="uploading")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pyramid metadata extracted by OpenSlide once the upload completes.
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    level_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mpp_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    mpp_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(120), nullable=True)

    uploaded_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    report: Mapped["Report"] = relationship(back_populates="slides")


class Share(Base):
    """A shareable link granting read-only viewer access to one slide."""

    __tablename__ = "shares"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    slide_id: Mapped[str] = mapped_column(ForeignKey("slides.id", ondelete="CASCADE"), index=True)

    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
