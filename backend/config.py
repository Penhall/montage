"""Application configuration via pydantic-settings.
All env vars are read from a .env file at startup.
See .env.example for the full list.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed configuration loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -- Database --
    database_url: str = "postgresql://authenticator:montage_local_dev@localhost:5432/montage"

    # -- Auth --
    jwt_secret: str = "montage_jwt_secret_dev_only"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # -- DeepSeek --
    deepseek_api_key: str = ""

    # -- Image APIs --
    pexels_api_key: str = ""
    pixabay_api_key: str = ""
    unsplash_access_key: str = ""

    # -- Server --
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # -- Stripe (stub) --
    stripe_secret_key: str = "***"
    stripe_webhook_secret: str = "***"

    # -- Logging --
    log_level: str = "INFO"

    # -- Paths --
    backend_root: Path = Path(__file__).parent.resolve()
    tmp_root: Path = backend_root / "tmp"
    remotion_root: Path = backend_root.parent / "remotion"
    videos_dir: Path = backend_root.parent / "data" / "videos"


settings = Settings()  # single importable instance
