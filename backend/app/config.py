from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _database_url(value: str) -> str:
    """Use psycopg 3 for PostgreSQL URLs, including provider-style postgres:// URLs."""
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value.removeprefix("postgres://")
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value.removeprefix("postgresql://")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_expire_minutes: int
    cors_origins: tuple[str, ...]
    seed_demo_data: bool
    ai_mode: str
    ai_provider: str
    qwen_api_key: str | None
    qwen_model: str
    ollama_base_url: str
    ollama_model: str
    ai_daily_budget_usd: float
    auto_create_schema: bool


def load_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return Settings(
        database_url=_database_url(os.getenv("DATABASE_URL", "sqlite:///./quanyi_mvp.db")),
        jwt_secret=os.getenv("JWT_SECRET", "local-development-secret-change-me"),
        jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "480")),
        cors_origins=tuple(item.strip() for item in origins.split(",") if item.strip()),
        seed_demo_data=_as_bool(os.getenv("SEED_DEMO_DATA"), True),
        ai_mode=os.getenv("AI_MODE", "mock").lower(),
        ai_provider=os.getenv("AI_PROVIDER", "dashscope").lower(),
        qwen_api_key=os.getenv("QWEN_API_KEY"),
        qwen_model=os.getenv("QWEN_MODEL", "qwen-turbo"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        ollama_model=os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
        ai_daily_budget_usd=float(os.getenv("AI_DAILY_BUDGET_USD", "1.0")),
        auto_create_schema=_as_bool(os.getenv("AUTO_CREATE_SCHEMA"), False),
    )
