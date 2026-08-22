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
    deepseek_api_key: str | None
    deepseek_base_url: str
    deepseek_model: str
    qwen_api_key: str | None
    qwen_model: str
    ollama_base_url: str
    ollama_model: str
    ai_daily_budget_usd: float
    auto_create_schema: bool
    public_app_url: str
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from_email: str | None
    smtp_from_name: str
    smtp_use_ssl: bool
    smtp_use_starttls: bool
    smtp_timeout_seconds: float
    wecom_corp_id: str | None
    wecom_agent_id: str | None
    wecom_app_secret: str | None


def load_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    app_origin = os.getenv("APP_ORIGIN", "http://localhost:5173").rstrip("/")
    app_base_path = "/" + os.getenv("APP_BASE_PATH", "/").strip("/")
    if app_base_path != "/":
        app_base_path += "/"
    return Settings(
        database_url=_database_url(os.getenv("DATABASE_URL", "sqlite:///./quanyi_mvp.db")),
        jwt_secret=os.getenv("JWT_SECRET", "local-development-secret-change-me"),
        jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "480")),
        cors_origins=tuple(item.strip() for item in origins.split(",") if item.strip()),
        seed_demo_data=_as_bool(os.getenv("SEED_DEMO_DATA"), False),
        ai_mode=os.getenv("AI_MODE", "mock").lower(),
        ai_provider=os.getenv("AI_PROVIDER", "deepseek").lower(),
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY") or None,
        deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        deepseek_model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        qwen_api_key=os.getenv("QWEN_API_KEY"),
        qwen_model=os.getenv("QWEN_MODEL", "qwen-turbo"),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        ollama_model=os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
        ai_daily_budget_usd=float(os.getenv("AI_DAILY_BUDGET_USD", "1.0")),
        auto_create_schema=_as_bool(os.getenv("AUTO_CREATE_SCHEMA"), False),
        public_app_url=(os.getenv("PUBLIC_APP_URL") or app_origin + app_base_path).rstrip("/") + "/",
        smtp_host=os.getenv("SMTP_HOST") or None,
        smtp_port=int(os.getenv("SMTP_PORT", "465")),
        smtp_username=os.getenv("SMTP_USERNAME") or None,
        smtp_password=os.getenv("SMTP_PASSWORD") or None,
        smtp_from_email=os.getenv("SMTP_FROM_EMAIL") or None,
        smtp_from_name=os.getenv("SMTP_FROM_NAME", "全意 AI 工作中枢"),
        smtp_use_ssl=_as_bool(os.getenv("SMTP_USE_SSL"), True),
        smtp_use_starttls=_as_bool(os.getenv("SMTP_USE_STARTTLS"), False),
        smtp_timeout_seconds=float(os.getenv("SMTP_TIMEOUT_SECONDS", "10")),
        wecom_corp_id=os.getenv("WECOM_CORP_ID") or None,
        wecom_agent_id=os.getenv("WECOM_AGENT_ID") or None,
        wecom_app_secret=os.getenv("WECOM_APP_SECRET") or None,
    )
