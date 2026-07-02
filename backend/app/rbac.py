"""Role-Based Access Control primitives.

Two roles exist:
  * ``admin``  – full control over the organization; implicitly holds every
                 permission and can manage users + permissions.
  * ``member`` – capabilities are governed entirely by their ``permissions`` set.

Permissions are fine-grained, per-user strings (stored as a JSON array on the
user row). The admin can toggle any permission for any member.
"""
from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"


class Permission(str, Enum):
    # Reports
    REPORT_CREATE = "report:create"
    REPORT_VIEW = "report:view"
    REPORT_EDIT = "report:edit"
    REPORT_DELETE = "report:delete"
    # Whole Slide Images
    SLIDE_UPLOAD = "slide:upload"
    SLIDE_VIEW = "slide:view"
    SLIDE_UPDATE = "slide:update"
    SLIDE_DELETE = "slide:delete"
    SLIDE_SHARE = "slide:share"


ALL_PERMISSIONS: list[str] = [p.value for p in Permission]

# Grouped for tidy rendering in the frontend permissions matrix.
PERMISSION_GROUPS: dict[str, list[str]] = {
    "Reports": [
        Permission.REPORT_CREATE.value,
        Permission.REPORT_VIEW.value,
        Permission.REPORT_EDIT.value,
        Permission.REPORT_DELETE.value,
    ],
    "Whole Slide Images": [
        Permission.SLIDE_UPLOAD.value,
        Permission.SLIDE_VIEW.value,
        Permission.SLIDE_UPDATE.value,
        Permission.SLIDE_DELETE.value,
        Permission.SLIDE_SHARE.value,
    ],
}

# Default grant for a newly-created member (read-only until admin grants more).
DEFAULT_MEMBER_PERMISSIONS: list[str] = [
    Permission.REPORT_VIEW.value,
    Permission.SLIDE_VIEW.value,
]


def has_permission(role: str, permissions: list[str] | None, needed: Permission) -> bool:
    """Admins pass everything; members must hold the specific permission."""
    if role == Role.ADMIN.value:
        return True
    return needed.value in (permissions or [])
