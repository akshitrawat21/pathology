"""User management (admin-only) + permission catalog.

All operations are strictly scoped to the caller's organization, so an admin
can never see or mutate users from another tenant.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import User
from ..rbac import (
    ALL_PERMISSIONS,
    DEFAULT_MEMBER_PERMISSIONS,
    PERMISSION_GROUPS,
    Role,
)
from ..schemas import PermissionCatalog, UserCreate, UserOut, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/permissions/catalog", response_model=PermissionCatalog)
def permission_catalog(_: User = Depends(get_current_user)) -> PermissionCatalog:
    return PermissionCatalog(
        all=ALL_PERMISSIONS,
        groups=PERMISSION_GROUPS,
        default_member=DEFAULT_MEMBER_PERMISSIONS,
    )


def _sanitize_permissions(perms: list[str] | None) -> list[str]:
    if not perms:
        return []
    return [p for p in perms if p in ALL_PERMISSIONS]


def _validate_role(role: str) -> str:
    if role not in (Role.ADMIN.value, Role.MEMBER.value):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid role: {role}")
    return role


@router.get("/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = (
        db.query(User)
        .filter(User.org_id == admin.org_id)
        .order_by(User.created_at.asc())
        .all()
    )
    return [UserOut.model_validate(u) for u in users]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A user with this email already exists"
        )
    role = _validate_role(body.role)
    if body.permissions is not None:
        perms = _sanitize_permissions(body.permissions)
    else:
        perms = list(ALL_PERMISSIONS) if role == Role.ADMIN.value else list(DEFAULT_MEMBER_PERMISSIONS)

    user = User(
        org_id=admin.org_id,
        email=email,
        name=body.name or email.split("@")[0],
        role=role,
        permissions=perms,
        status="invited",  # becomes "active" on first Google Sign-In
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


def _get_org_user(db: Session, org_id: str, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None or user.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return UserOut.model_validate(_get_org_user(db, admin.org_id, user_id))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = _get_org_user(db, admin.org_id, user_id)

    # Guard: an admin cannot lock themselves out or demote the last admin.
    is_self = user.id == admin.id
    if body.role is not None:
        new_role = _validate_role(body.role)
        if is_self and new_role != Role.ADMIN.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot demote yourself")
        if user.role == Role.ADMIN.value and new_role != Role.ADMIN.value:
            _assert_not_last_admin(db, admin.org_id, user.id)
        user.role = new_role
    if body.is_active is not None:
        if is_self and body.is_active is False:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot disable yourself")
        user.is_active = body.is_active
    if body.name is not None:
        user.name = body.name
    if body.permissions is not None:
        user.permissions = _sanitize_permissions(body.permissions)

    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    user = _get_org_user(db, admin.org_id, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete yourself")
    if user.role == Role.ADMIN.value:
        _assert_not_last_admin(db, admin.org_id, user.id)
    db.delete(user)
    db.commit()


def _assert_not_last_admin(db: Session, org_id: str, excluding_user_id: str) -> None:
    remaining = (
        db.query(User)
        .filter(
            User.org_id == org_id,
            User.role == Role.ADMIN.value,
            User.is_active.is_(True),
            User.id != excluding_user_id,
        )
        .count()
    )
    if remaining == 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Organization must have at least one active admin",
        )
