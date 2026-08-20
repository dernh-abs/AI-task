from app.config import _database_url


def test_postgres_provider_url_uses_psycopg3() -> None:
    assert _database_url("postgres://user:pass@db:5432/app") == "postgresql+psycopg://user:pass@db:5432/app"
    assert _database_url("postgresql://user:pass@db:5432/app") == "postgresql+psycopg://user:pass@db:5432/app"


def test_explicit_driver_and_sqlite_urls_are_unchanged() -> None:
    assert _database_url("postgresql+psycopg://user:pass@db:5432/app") == "postgresql+psycopg://user:pass@db:5432/app"
    assert _database_url("sqlite:///./local.db") == "sqlite:///./local.db"
