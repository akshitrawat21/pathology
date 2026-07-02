"""FastAPI application entrypoint.

Run locally:  uvicorn app.main:app --reload
API docs:     http://localhost:8000/docs
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import auth, reports, shares, slides, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create tables on first run (Alembic handles prod migrations)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Multi-tenant pathology SaaS: RBAC, reports, and WSI viewing.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All application routes live under /api.
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(slides.router, prefix="/api")
app.include_router(shares.router, prefix="/api")
app.include_router(shares.public_router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENV}
