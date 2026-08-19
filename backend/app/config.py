from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_expire_minutes: int
    cors_origins: tuple[str, ...]
    seed_demo_data: bool
    ai_mode: str
    qwen_api_key: str | None
    qwen_model: str
    ai_daily_budget_usd: float
    auto_create_schema: bool


def load_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./quanyi_mvp.db"),
        jwt_secret=os.getenv("JWT_SECRET", "local-development-secret-change-me"),
        jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "480")),
        cors_origins=tuple(item.strip() for item in origins.split(",") if item.strip()),
        seed_demo_data=_as_bool(os.getenv("SEED_DEMO_DATA"), True),
        ai_mode=os.getenv("AI_MODE", "mock").lower(),
        qwen_api_key=os.getenv("QWEN_API_KEY"),
        qwen_model=os.getenv("QWEN_MODEL", "qwen-turbo"),
        ai_daily_budget_usd=float(os.getenv("AI_DAILY_BUDGET_USD", "1.0")),
        auto_create_schema=_as_bool(os.getenv("AUTO_CREATE_SCHEMA"), False),
    )
