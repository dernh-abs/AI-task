from app.config import _database_url, load_settings


def test_postgres_provider_url_uses_psycopg3() -> None:
    assert _database_url("postgres://user:pass@db:5432/app") == "postgresql+psycopg://user:pass@db:5432/app"
    assert _database_url("postgresql://user:pass@db:5432/app") == "postgresql+psycopg://user:pass@db:5432/app"


def test_explicit_driver_and_sqlite_urls_are_unchanged() -> None:
    assert _database_url("postgresql+psycopg://user:pass@db:5432/app") == "postgresql+psycopg://user:pass@db:5432/app"
    assert _database_url("sqlite:///./local.db") == "sqlite:///./local.db"


def test_demo_seed_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("SEED_DEMO_DATA", raising=False)
    assert load_settings().seed_demo_data is False
