"""Session token (JWT) creation and verification.

We mint our *own* short-lived JWT after verifying the user's identity (via
Google or dev login). The Google ID token is only used once, at login, to
establish who the user is; thereafter the client presents our token.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from .config import settings


def create_access_token(subject: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        **(extra or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError subclasses on invalid/expired tokens."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
