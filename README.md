# PathoSlide — Multi-Tenant Pathology SaaS

A multi-tenant web application for pathology teams: organizations manage users
and reports, upload Whole Slide Images (`.svs`), view them in the browser with
smooth pan/zoom, and share slides — all governed by fine-grained Role-Based
Access Control.

Built for the Founding Full Stack Developer assignment.

- **Backend:** Python · FastAPI · SQLAlchemy · OpenSlide (DeepZoom tiling)
- **Frontend:** React · TypeScript · Vite · OpenSeadragon · TanStack Query
- **Auth:** Google Sign-In (with a dev-login fallback for local testing)
- **DB:** SQLite by default (zero-config); PostgreSQL-ready

---

## Table of contents
1. [Features](#features)
2. [Quick start](#quick-start-local)
3. [Enabling real Google Sign-In](#enabling-real-google-sign-in-optional)
4. [Environment variables](#environment-variables)
5. [Architecture](#architecture)
6. [Database schema](#database-schema)
7. [RBAC / permissions](#rbac--permissions)
8. [API overview](#api-overview)
9. [Whole Slide Image viewing](#whole-slide-image-viewing)
10. [Testing](#testing)
11. [Assumptions & trade-offs](#assumptions--trade-offs)

---

## Features

| Requirement | Where |
| --- | --- |
| Google Sign-In authentication | `POST /api/auth/google` → verifies Google ID token → issues app JWT |
| First-login org onboarding | New email → onboarding token → `POST /api/auth/onboarding` creates org + admin |
| Subsequent logins go to dashboard | Known email → access token → app |
| Multi-tenant with full data isolation | Every row carries `org_id`; every query is org-scoped |
| User management (view/create/edit/delete) | Admin-only `/api/users` endpoints + **Users & Roles** page |
| RBAC (per-user permissions) | 9 permissions; enforced in backend deps **and** reflected in the UI |
| Report management (CRUD) | `/api/reports` + **Reports** pages |
| SVS upload (multiple, with progress) | `POST /api/reports/{id}/slides`, per-file progress bars |
| WSI viewer (pan/zoom, no full download) | OpenSlide DeepZoom tiles + OpenSeadragon |
| Sharing | Unguessable public link → in-browser viewer, revocable |

---

## Quick start (local)

**Prerequisites:** Python 3.11–3.13 and Node.js 18+.
> ⚠️ Python **3.14 is not yet supported** by some dependencies (no wheels). Use 3.11–3.13.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # defaults work out of the box
uvicorn app.main:app --reload
```

Backend runs on **http://localhost:8000** · interactive API docs at **/docs**.
Tables are created automatically on first run (SQLite file `pathology.db`).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env          # defaults work out of the box
npm run dev
```

Frontend runs on **http://localhost:5173** and proxies `/api` to the backend.

### 3. Try it

Open **http://localhost:5173**. Google Sign-In is off until you configure it
(see below), so use **Dev login**: enter any email → you'll be prompted to
create an organization (you become its admin) → dashboard.

To test multi-tenancy / RBAC, invite a member from **Users & Roles**, then dev-login
as that email in a separate browser/incognito window.

A sample slide is included at `backend/samples/CMU-1-Small-Region.svs` for upload
testing. More samples: <https://openslide.cs.cmu.edu/download/openslide-testdata/Aperio/>

---

## Enabling real Google Sign-In (optional)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**.
2. Create an **OAuth 2.0 Client ID** of type **Web application**.
3. Under **Authorized JavaScript origins**, add `http://localhost:5173`.
4. Copy the **Client ID** into `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ALLOW_DEV_LOGIN=false      # optional: disable dev login once Google works
   ```
5. Restart the backend. The login page will now show the Google button.

The backend verifies the Google ID token's signature and audience server-side
(`google-auth`), then issues its own JWT for subsequent requests.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./pathology.db` | SQLAlchemy URL. Postgres: `postgresql+psycopg2://user:pass@host:5432/db` |
| `SECRET_KEY` | `dev-secret-change-me` | Signs app JWTs. **Change in any shared environment.** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Session token lifetime |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth Web Client ID. Empty = Google Sign-In disabled |
| `ALLOW_DEV_LOGIN` | `true` | Email-only login for local testing. Set `false` in production |
| `STORAGE_DIR` | `./storage` | Where uploaded `.svs` files are stored |
| `MAX_UPLOAD_BYTES` | `5368709120` (5 GB) | Per-file upload cap |
| `DEEPZOOM_TILE_SIZE` / `_OVERLAP` / `_FORMAT` | `254` / `1` / `jpeg` | DeepZoom tiling params |
| `SLIDE_CACHE_SIZE` | `8` | Open slides kept in memory (LRU) |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed frontend origins |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | API base. Leave as `/api` to use the Vite dev proxy |
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Where the dev proxy forwards `/api` |

---

## Architecture

```
frontend (React/Vite)  ──/api──▶  backend (FastAPI)  ──▶  SQLite/Postgres
        │                              │
   OpenSeadragon                  OpenSlide DeepZoom  ──▶  local file storage (.svs)
   (tile requests)                 (on-demand tiles)
```

- **Auth:** Google ID token (or dev email) is verified once at login; the server
  then issues its own JWT (`typ: access`). First-time users without an org get a
  short-lived `typ: onboarding` token that only unlocks `POST /auth/onboarding`.
- **Multi-tenancy:** shared DB, shared schema, **row-level scoping**. Every
  tenant row has `org_id`, and every query filters by the caller's `org_id`, so
  organizations are fully isolated.
- **RBAC:** `require(Permission)` FastAPI dependencies guard each route; admins
  implicitly hold all permissions. The frontend hides/greys actions the user
  lacks, but the **backend is the source of truth**.
- **WSI:** `.svs` files never leave the server. The backend serves DeepZoom tiles
  on demand via OpenSlide; the browser fetches only the ~256px tiles currently
  in view.

```
backend/app/
  main.py          # app + router wiring
  config.py        # settings (.env)
  database.py      # engine/session, create_all
  models.py        # ORM: Organization, User, Report, Slide, Share
  schemas.py       # Pydantic request/response models
  security.py      # JWT create/decode
  google_auth.py   # Google ID token verification
  deps.py          # auth + tenant scoping + RBAC dependencies
  rbac.py          # roles + permission catalog
  storage.py       # file storage (local driver)
  slide_service.py # OpenSlide DeepZoom tiling + open-slide LRU cache
  routers/         # auth, users, reports, slides, shares
frontend/src/
  api/             # axios client, types, TanStack Query hooks
  auth/            # AuthContext (token, user/org, permission helper)
  components/      # Layout, SlideViewer (OpenSeadragon), modals, guards
  pages/           # Login, Onboarding, Dashboard, Reports, Users, viewers
```

---

## Database schema

```
organizations                users
  id (PK)                       id (PK)
  name                          org_id (FK → organizations)
  slug (unique)                 email (unique)
  created_at                    google_sub (unique, nullable)
                                name, picture
                                role         ('admin' | 'member')
                                permissions  (JSON array of permission strings)
                                status       ('invited' | 'active')
                                is_active

reports                       slides                         shares
  id (PK)                       id (PK)                        id (PK)
  org_id (FK)                   org_id (FK)                    org_id (FK)
  title, description            report_id (FK → reports)       slide_id (FK → slides)
  created_by (FK → users)       original_filename, stored_path token (unique)
  created_at, updated_at        size_bytes, status, error      created_by, created_at
                                width, height, level_count     expires_at (nullable)
                                mpp_x, mpp_y, vendor           revoked
                                uploaded_by, created_at
```

Relationships: an organization has many users, reports, slides and shares; a
report has many slides; a slide has many shares. Deletes cascade
(org → reports → slides → shares), and slide files are cleaned from disk on delete.

**Migrations:** tables auto-create on startup for convenience. A real Alembic
migration is also included:

```bash
cd backend
alembic upgrade head      # apply
alembic revision --autogenerate -m "message"   # after model changes
```

---

## RBAC / permissions

Two roles: **admin** (full control, manages users + permissions, implicitly holds
every permission) and **member** (governed by their granted permissions).

| Reports | Whole Slide Images |
| --- | --- |
| `report:create` | `slide:upload` |
| `report:view` | `slide:view` |
| `report:edit` | `slide:update` |
| `report:delete` | `slide:delete` |
| | `slide:share` |

New members default to read-only (`report:view`, `slide:view`); an admin adjusts
each user's permissions from the **Users & Roles** page. Guards prevent an org
from losing its last admin or an admin from locking themselves out.

---

## API overview

All routes are under `/api`. Auth via `Authorization: Bearer <token>`.

```
POST   /auth/google              Login with Google ID token
POST   /auth/dev                 Dev login (email only; if enabled)
POST   /auth/onboarding          Create org + first admin (onboarding token)
GET    /auth/me                  Current user + organization
GET    /auth/config              Public: which login methods are enabled

GET    /users                    List (admin)          GET  /permissions/catalog
POST   /users                    Invite (admin)        PATCH/DELETE /users/{id}

GET/POST        /reports                 PATCH/DELETE /reports/{id}
POST   /reports/{id}/slides      Upload a slide (multipart)
GET    /slides/{id}              Metadata              PATCH/DELETE /slides/{id}
GET    /slides/{id}/dzi          DeepZoom descriptor
GET    /slides/{id}/tiles/{level}/{col}_{row}.jpeg   A tile
GET    /slides/{id}/thumbnail    Thumbnail

POST/GET  /slides/{id}/shares    Create/list share links   DELETE /shares/{id}
GET    /shared/{token}           Public slide metadata (no auth)
GET    /shared/{token}/dzi | /tiles/... | /thumbnail        Public tiles
```

Full interactive docs: **http://localhost:8000/docs**.

---

## Whole Slide Image viewing

`.svs` files are pyramidal, multi-gigabyte TIFFs. We never send the whole file to
the browser:

1. On upload, OpenSlide extracts dimensions / levels / microns-per-pixel.
2. The viewer requests a DeepZoom descriptor, then OpenSeadragon requests only the
   tiles for the current view/zoom level.
3. The backend generates each tile on demand with `DeepZoomGenerator` and caches
   open slides (LRU) so a viewing session is fast.

Authenticated tiles are fetched with the bearer token (OpenSeadragon
`loadTilesWithAjax`); shared tiles use the public token in the URL.

---

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q
```

The smoke test exercises the whole stack end-to-end: dev auth → onboarding →
RBAC enforcement → real SVS upload + ingestion → DeepZoom tile + thumbnail →
sharing (public) → multi-tenant isolation.

---

## Deploy to Render (one blueprint)

A `render.yaml` blueprint is included that provisions both services at once — no
Docker needed (`openslide-bin` ships the OpenSlide binary as a wheel).

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo → **Apply**. This creates:
   - `pathoslide-api` — the FastAPI service (Python)
   - `pathoslide-web` — the React app (static site)
3. After they build, you'll have two URLs. Set the env vars the blueprint left
   blank (they depend on those URLs):
   - API service → `GOOGLE_CLIENT_ID` = your OAuth client ID; `CORS_ORIGINS` = the web URL
   - Web service → `VITE_API_BASE_URL` = the API URL + `/api`, then **redeploy the web service**
     (Vite bakes this in at build time).
4. Add the web URL to Google Cloud → **Authorized JavaScript origins**.

**Notes**
- Free services sleep when idle and use an **ephemeral filesystem** — uploaded
  slides + the SQLite DB reset on restart (fine for a demo). For persistence,
  switch the API to a paid plan and enable the `disk:` block in `render.yaml`
  (then point `STORAGE_DIR`/`DATABASE_URL` at `/var/data`).
- Deploy the backend as a **real service, not serverless** (Vercel/Netlify
  functions cap request bodies at a few MB, which breaks SVS uploads).

## Assumptions & trade-offs

- **Dev login fallback.** So the app is fully testable without Google credentials,
  a documented email-only login exists. Google Sign-In is the primary path;
  set `ALLOW_DEV_LOGIN=false` to enforce Google-only.
- **One email → one organization.** Email is globally unique; a person belongs to a
  single tenant (matches the "auto-associate to existing org" requirement). A
  multi-org membership model would need a join table.
- **First user of an org is its admin.** Additional users are invited by the admin
  (by email) and auto-associate on their first sign-in.
- **SQLite by default** for zero-config local runs; the code is Postgres-ready via
  `DATABASE_URL` (JSON columns + string UUID PKs work on both).
- **Local filesystem storage**, behind a small `storage.py` interface that could be
  swapped for S3/GCS. Slides are namespaced per org (`storage/<org_id>/`).
- **Synchronous ingestion.** Metadata extraction runs during the upload request.
  It's fast for typical slides; very large batches would benefit from a background
  worker (Celery/RQ) — deliberately out of scope here.
- **Tiles generated on demand** (not pre-tiled) with an open-slide LRU cache — simpler
  and storage-light; a production system might pre-generate/CDN-cache tiles.
- **Sharing = unguessable capability link** (optionally expiring, revocable). Simple
  by design, as the brief allows; no per-recipient accounts.
- **Auth tokens in `localStorage`.** Convenient for a SPA; httpOnly cookies would be
  more XSS-resilient for production.
- **Kept intentionally simple** (no Docker/CI/queues) — this is an assignment meant
  to run locally with two commands.
```
