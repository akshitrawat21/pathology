"""Google Sign-In: verify the ID token issued by Google Identity Services.

The frontend uses the Google Identity Services (GIS) library to obtain an ID
token (a signed JWT). We verify its signature and audience server-side using
``google-auth`` and return the trusted identity claims.
"""
from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .config import settings


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: str
    picture: str | None


class GoogleAuthError(Exception):
    pass


_request = google_requests.Request()


def verify_google_token(credential: str) -> GoogleIdentity:
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError(
            "Google Sign-In is not configured (GOOGLE_CLIENT_ID is empty)."
        )
    try:
        claims = id_token.verify_oauth2_token(
            credential, _request, settings.GOOGLE_CLIENT_ID
        )
    except ValueError as exc:  # bad signature, wrong audience, expired, etc.
        raise GoogleAuthError(f"Invalid Google token: {exc}") from exc

    if not claims.get("email_verified", False):
        raise GoogleAuthError("Google account email is not verified.")

    return GoogleIdentity(
        sub=claims["sub"],
        email=claims["email"].lower(),
        name=claims.get("name", ""),
        picture=claims.get("picture"),
    )
