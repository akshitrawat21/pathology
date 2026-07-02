"""SQLAlchemy engine / session setup.

Works with SQLite (dev) and PostgreSQL (prod) transparently. The only
DB-specific tweak is the SQLite ``check_same_thread`` connect arg.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from .config import settings

# Managed Postgres (e.g. Render/Heroku) sometimes hands out the legacy
# "postgres://" scheme, which SQLAlchemy 2.x rejects — normalize it.
DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if they do not yet exist (dev convenience).

    Production uses Alembic migrations (see ``alembic/``), but ``create_all`` is
    idempotent and keeps local setup to a single command.
    """
    from . import models  # noqa: F401  (register mappers)

    Base.metadata.create_all(bind=engine)
