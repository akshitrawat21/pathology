"""Authentication & organization onboarding.

Login flow (Google Sign-In is the primary path; dev login mirrors it for local
testing without Google credentials):

    1. Client obtains an identity (Google ID token, or an email in dev mode).
    2. Backend resolves it to a User:
         - known email  -> issue an ACCESS token -> dashboard
         - unknown email -> issue a short-lived ONBOARDING token -> the client
           collects org details and calls /auth/onboarding, which creates the
           organization + the first admin user, then issues an ACCESS token.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import TYP_ACCESS, TYP_ONBOARDING, get_current_user, get_onboarding_claims
from ..google_auth import GoogleAuthError, verify_google_token
from ..models import Organization, User
from ..rbac import ALL_PERMISSIONS, Role
from ..schemas import (
    DevLoginRequest,
    GoogleLoginRequest,
    MeOut,
    OrgOnboardingRequest,
    TokenResponse,
    UserOut,
)
from ..security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_for_identity(
    db: Session, *, sub: str, email: str, name: str, picture: str | None
) -> TokenResponse:
    """Resolve a verified identity to an access token, or an onboarding token."""
    email = email.lower()
    user = db.query(User).filter(User.email == email).first()

    if user is None:
        # First-time user with no organization -> onboarding.
        onboarding = create_access_token(
            sub,
            {"typ": TYP_ONBOARDING, "email": email, "name": name, "picture": picture},
        )
        return TokenResponse(access_token=onboarding, needs_onboarding=True, user=None)

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled")

    # First actual sign-in for an admin-invited user: bind identity + activate.
    changed = False
    if user.google_sub is None:
        user.google_sub = sub
        changed = True
    if user.status != "active":
        user.status = "active"
        changed = True
    if name and not user.name:
        user.name = name
        changed = True
    if picture and not user.picture:
        user.picture = picture
        changed = True
    if changed:
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id, {"typ": TYP_ACCESS, "org_id": user.org_id})
    return TokenResponse(
        access_token=token, needs_onboarding=False, user=UserOut.model_validate(user)
    )


@router.get("/config")
def auth_config() -> dict:
    """Public config so the frontend knows which login methods to render."""
    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID or None,
        "google_enabled": bool(settings.GOOGLE_CLIENT_ID),
        "dev_login_enabled": settings.ALLOW_DEV_LOGIN,
    }


@router.post("/google", response_model=TokenResponse)
def login_google(body: GoogleLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        identity = verify_google_token(body.credential)
    except GoogleAuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    return _issue_for_identity(
        db,
        sub=identity.sub,
        email=identity.email,
        name=identity.name,
        picture=identity.picture,
    )


@router.post("/dev", response_model=TokenResponse)
def login_dev(body: DevLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Local-only login bypassing Google. Disabled unless ALLOW_DEV_LOGIN=true."""
    if not settings.ALLOW_DEV_LOGIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Dev login is disabled")
    email = body.email.lower()
    return _issue_for_identity(
        db,
        sub=f"dev:{email}",
        email=email,
        name=body.name or email.split("@")[0],
        picture=None,
    )


@router.post("/onboarding", response_model=TokenResponse)
def onboarding(
    body: OrgOnboardingRequest,
    claims: dict = Depends(get_onboarding_claims),
    db: Session = Depends(get_db),
) -> TokenResponse:
    email = claims["email"].lower()

    # Idempotency: if the user got created meanwhile, just log them in.
    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        token = create_access_token(existing.id, {"typ": TYP_ACCESS, "org_id": existing.org_id})
        return TokenResponse(
            access_token=token, needs_onboarding=False, user=UserOut.model_validate(existing)
        )

    if db.query(Organization).filter(Organization.slug == body.slug).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Organization slug already taken")

    org = Organization(name=body.name, slug=body.slug)
    db.add(org)
    db.flush()  # populate org.id

    admin = User(
        org_id=org.id,
        email=email,
        name=claims.get("name") or email.split("@")[0],
        picture=claims.get("picture"),
        google_sub=claims.get("sub"),
        role=Role.ADMIN.value,
        permissions=list(ALL_PERMISSIONS),
        status="active",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    token = create_access_token(admin.id, {"typ": TYP_ACCESS, "org_id": admin.org_id})
    return TokenResponse(
        access_token=token, needs_onboarding=False, user=UserOut.model_validate(admin)
    )


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeOut:
    org = db.get(Organization, user.org_id)
    return MeOut(user=UserOut.model_validate(user), organization=org)
