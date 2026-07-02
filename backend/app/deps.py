"""FastAPI dependencies: authentication, tenant scoping, and RBAC guards."""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .rbac import Permission, Role, has_permission
from .security import decode_access_token

# auto_error=False so we can raise our own 401 with a clear message.
_bearer = HTTPBearer(auto_error=False)

# Token "typ" values
TYP_ACCESS = "access"
TYP_ONBOARDING = "onboarding"


def _decode(creds: HTTPAuthorizationCredentials | None) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        return decode_access_token(creds.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = _decode(creds)
    if payload.get("typ") != TYP_ACCESS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Onboarding not complete")
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or disabled")
    return user


def get_onboarding_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Used by the onboarding endpoint; carries a verified identity but no user yet."""
    payload = _decode(creds)
    if payload.get("typ") != TYP_ONBOARDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not an onboarding token")
    return payload


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != Role.ADMIN.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return user


def require(permission: Permission):
    """Dependency factory enforcing a single fine-grained permission."""

    def _dep(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user.role, user.permissions, permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Missing permission: {permission.value}",
            )
        return user

    return _dep


def _user_from_token(raw: str, db: Session) -> User:
    try:
        payload = decode_access_token(raw)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
    if payload.get("typ") != TYP_ACCESS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Onboarding not complete")
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or disabled")
    return user


def get_current_user_flex(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    token: str | None = Query(None),
    db: Session = Depends(get_db),
) -> User:
    """Like get_current_user, but also accepts the token via a ``?token=`` query
    parameter. Needed for <img>/tile requests that OpenSeadragon issues without
    the ability to attach an Authorization header."""
    raw = (creds.credentials if creds and creds.credentials else None) or token
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return _user_from_token(raw, db)


def require_flex(permission: Permission):
    """Permission guard that accepts a header OR ``?token=`` query param."""

    def _dep(user: User = Depends(get_current_user_flex)) -> User:
        if not has_permission(user.role, user.permissions, permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Missing permission: {permission.value}",
            )
        return user

    return _dep
