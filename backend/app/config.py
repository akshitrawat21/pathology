"""Application configuration, loaded from environment / .env file.

All settings are documented in ``.env.example``. Sensible development defaults
are provided so the stack runs out-of-the-box; production deployments should
override SECRET_KEY, DATABASE_URL, GOOGLE_CLIENT_ID and disable dev login.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- General ---
    APP_NAME: str = "Pathology SaaS"
    ENV: str = "development"  # development | production

    # --- Database ---
    # SQLite for zero-config local dev; swap to postgresql://... in production.
    DATABASE_URL: str = "sqlite:///./pathology.db"

    # --- Auth / JWT ---
    SECRET_KEY: str = "dev-secret-change-me"  # MUST be overridden in production
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    JWT_ALGORITHM: str = "HS256"

    # --- Google Sign-In ---
    # OAuth 2.0 Web client ID from Google Cloud Console. Required for real
    # Google Sign-In. When empty, only dev login (below) is available.
    GOOGLE_CLIENT_ID: str = ""

    # Dev login lets you authenticate with just an email during local testing,
    # bypassing Google. NEVER enable in production.
    ALLOW_DEV_LOGIN: bool = True

    # --- Storage ---
    # Directory where uploaded .svs files are stored (local filesystem driver).
    STORAGE_DIR: str = str(BACKEND_DIR / "storage")
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024 * 1024  # 5 GB per file

    # --- WSI tiling ---
    DEEPZOOM_TILE_SIZE: int = 254
    DEEPZOOM_OVERLAP: int = 1
    DEEPZOOM_FORMAT: str = "jpeg"  # jpeg | png
    DEEPZOOM_JPEG_QUALITY: int = 80
    SLIDE_CACHE_SIZE: int = 8  # number of open slides kept in memory

    # --- CORS ---
    # Comma-separated list of allowed frontend origins.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        p = Path(self.STORAGE_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
