"""Pydantic request/response models (API contract)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., description="Google ID token (JWT) from GSI")


class DevLoginRequest(BaseModel):
    email: EmailStr
    name: str | None = None


class OrgOnboardingRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    needs_onboarding: bool = False
    user: "UserOut | None" = None


# --------------------------------------------------------------------------- #
# Organization
# --------------------------------------------------------------------------- #
class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    created_at: datetime


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    org_id: str
    email: EmailStr
    name: str
    picture: str | None = None
    role: str
    permissions: list[str]
    status: str
    is_active: bool
    created_at: datetime


class MeOut(BaseModel):
    user: UserOut
    organization: OrganizationOut


class UserCreate(BaseModel):
    email: EmailStr
    name: str = ""
    role: str = "member"  # "admin" | "member"
    permissions: list[str] | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
class ReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""


class ReportUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class SlideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    report_id: str
    original_filename: str
    size_bytes: int
    status: str
    error: str | None = None
    width: int | None = None
    height: int | None = None
    level_count: int | None = None
    mpp_x: float | None = None
    mpp_y: float | None = None
    vendor: str | None = None
    uploaded_by: str | None = None
    created_at: datetime


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    description: str
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    slide_count: int = 0


class ReportDetailOut(ReportOut):
    slides: list[SlideOut] = []


# --------------------------------------------------------------------------- #
# Sharing
# --------------------------------------------------------------------------- #
class ShareCreate(BaseModel):
    expires_in_hours: int | None = Field(
        None, ge=1, le=24 * 365, description="Optional expiry; null = never expires"
    )


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    slide_id: str
    token: str
    created_at: datetime
    expires_at: datetime | None = None
    revoked: bool


class SharedSlideOut(BaseModel):
    """Public payload for a shared slide (no org/user data leaked)."""
    slide_id: str
    original_filename: str
    width: int | None
    height: int | None
    mpp_x: float | None
    mpp_y: float | None
    vendor: str | None


# --------------------------------------------------------------------------- #
# Meta
# --------------------------------------------------------------------------- #
class PermissionCatalog(BaseModel):
    all: list[str]
    groups: dict[str, list[str]]
    default_member: list[str]


TokenResponse.model_rebuild()
