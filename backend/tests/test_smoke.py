"""End-to-end smoke test for the whole backend.

Covers: dev auth, org onboarding, RBAC enforcement, SVS upload + ingestion,
DeepZoom tiles, thumbnails, sharing (public), and multi-tenant isolation.

Run:  pytest -q
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import init_db
from app.main import app

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "CMU-1-Small-Region.svs"

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _onboard(email: str, org_name: str, slug: str) -> tuple[str, dict]:
    """Dev-login a brand-new email and complete onboarding. Returns (access_token, user)."""
    r = client.post("/api/auth/dev", json={"email": email})
    assert r.status_code == 200, r.text
    assert r.json()["needs_onboarding"] is True
    onboarding_token = r.json()["access_token"]

    r = client.post(
        "/api/auth/onboarding",
        headers=_auth(onboarding_token),
        json={"name": org_name, "slug": slug},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["needs_onboarding"] is False
    return data["access_token"], data["user"]


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_full_flow():
    # --- Onboarding creates org + admin with all permissions ---
    admin_token, admin = _onboard("admin@acmelabs.io", "Acme Labs", "acme")
    assert admin["role"] == "admin"
    assert "slide:upload" in admin["permissions"]

    me = client.get("/api/auth/me", headers=_auth(admin_token)).json()
    assert me["organization"]["slug"] == "acme"

    # --- Report creation ---
    r = client.post("/api/reports", headers=_auth(admin_token), json={"title": "Case 001"})
    assert r.status_code == 201, r.text
    report = r.json()

    # --- SVS upload + ingestion ---
    assert SAMPLE.exists(), f"sample missing: {SAMPLE}"
    with SAMPLE.open("rb") as f:
        r = client.post(
            f"/api/reports/{report['id']}/slides",
            headers=_auth(admin_token),
            files={"file": (SAMPLE.name, f, "application/octet-stream")},
        )
    assert r.status_code == 201, r.text
    slide = r.json()
    assert slide["status"] == "ready", slide
    assert slide["width"] == 2220 and slide["height"] == 2967
    slide_id = slide["id"]

    # --- DZI + a real tile + thumbnail ---
    dzi = client.get(f"/api/slides/{slide_id}/dzi", headers=_auth(admin_token)).json()
    assert dzi["Image"]["Size"]["Width"] == 2220
    max_level = dzi["level_count"] - 1
    t = client.get(f"/api/slides/{slide_id}/tiles/{max_level}/0_0.jpeg", headers=_auth(admin_token))
    assert t.status_code == 200 and t.headers["content-type"] == "image/jpeg"
    assert len(t.content) > 0
    # Tiles must also authenticate via ?token= query (the viewer loads them as <img>).
    tq = client.get(f"/api/slides/{slide_id}/tiles/{max_level}/0_0.jpeg?token={admin_token}")
    assert tq.status_code == 200 and tq.headers["content-type"] == "image/jpeg"
    assert client.get(f"/api/slides/{slide_id}/dzi?token={admin_token}").status_code == 200
    # ...but a bad/absent token is still rejected.
    assert client.get(f"/api/slides/{slide_id}/tiles/{max_level}/0_0.jpeg").status_code == 401
    th = client.get(f"/api/slides/{slide_id}/thumbnail", headers=_auth(admin_token))
    assert th.status_code == 200

    # --- RBAC: create a read-only member ---
    r = client.post(
        "/api/users",
        headers=_auth(admin_token),
        json={"email": "member@acmelabs.io", "role": "member"},
    )
    assert r.status_code == 201, r.text
    member = r.json()
    assert set(member["permissions"]) == {"report:view", "slide:view"}

    member_token, _ = login_existing("member@acmelabs.io")
    # Can view reports (has report:view)...
    assert client.get("/api/reports", headers=_auth(member_token)).status_code == 200
    # ...but cannot create one (no report:create) or upload (no slide:upload).
    assert client.post("/api/reports", headers=_auth(member_token), json={"title": "x"}).status_code == 403
    with SAMPLE.open("rb") as f:
        up = client.post(
            f"/api/reports/{report['id']}/slides",
            headers=_auth(member_token),
            files={"file": (SAMPLE.name, f, "application/octet-stream")},
        )
    assert up.status_code == 403
    # Members cannot manage users at all.
    assert client.get("/api/users", headers=_auth(member_token)).status_code == 403

    # --- Sharing (public, no auth needed) ---
    r = client.post(f"/api/slides/{slide_id}/shares", headers=_auth(admin_token), json={})
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    pub = client.get(f"/api/shared/{token}")
    assert pub.status_code == 200 and pub.json()["width"] == 2220
    assert client.get(f"/api/shared/{token}/dzi").status_code == 200
    assert client.get(f"/api/shared/{token}/tiles/{max_level}/0_0.jpeg").status_code == 200

    # --- Multi-tenant isolation ---
    bob_token, _ = _onboard("bob@otherinc.io", "Other Inc", "other")
    assert client.get("/api/reports", headers=_auth(bob_token)).json() == []
    # Bob cannot touch Acme's slide or report.
    assert client.get(f"/api/slides/{slide_id}", headers=_auth(bob_token)).status_code == 404
    assert client.get(f"/api/reports/{report['id']}", headers=_auth(bob_token)).status_code == 404


def login_existing(email: str) -> tuple[str, dict]:
    """Dev-login an already-onboarded/invited user (goes straight to a token)."""
    r = client.post("/api/auth/dev", json={"email": email})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["needs_onboarding"] is False, data
    return data["access_token"], data["user"]
