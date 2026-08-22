from sqlmodel import Session, SQLModel, create_engine

from app import model_gateway
from app.config import load_settings


def test_deepseek_target_uses_v4_flash_and_bearer_auth(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-secret-key")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/")
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

    target = model_gateway._live_target(load_settings())

    assert target.provider == "deepseek"
    assert target.url == "https://api.deepseek.com/chat/completions"
    assert target.auth_header == "Bearer test-secret-key"
    assert target.model == "deepseek-v4-flash"
    assert target.use_json_format is True
    assert target.configured is True
    assert "test-secret-key" not in repr(target)


def test_deepseek_without_key_does_not_call_network(tmp_path, monkeypatch) -> None:
    test_engine = create_engine(f"sqlite:///{(tmp_path / 'missing-key.db').as_posix()}")
    SQLModel.metadata.create_all(test_engine)
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PROVIDER", "deepseek")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("network must not be called without an API key")

    monkeypatch.setattr(model_gateway, "_live_chat", fail_if_called)
    with Session(test_engine) as session:
        result = model_gateway.generate_task_draft(session, "project-test", "整理交付说明")

    assert result.execution_mode == "FALLBACK"
    assert result.degraded is True
    assert result.fallback_reason == "PROVIDER_NOT_CONFIGURED"
    test_engine.dispose()


def test_unknown_provider_fails_closed(tmp_path, monkeypatch) -> None:
    test_engine = create_engine(f"sqlite:///{(tmp_path / 'unknown-provider.db').as_posix()}")
    SQLModel.metadata.create_all(test_engine)
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PROVIDER", "typo-provider")

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("unsupported providers must not call a default endpoint")

    monkeypatch.setattr(model_gateway, "_live_chat", fail_if_called)
    with Session(test_engine) as session:
        result = model_gateway.generate_project_chat_reply(session, "project-test", "进度如何", "任务 A")

    assert result.execution_mode == "FALLBACK"
    assert result.degraded is True
    assert result.fallback_reason == "PROVIDER_NOT_CONFIGURED"
    test_engine.dispose()


def test_dashscope_task_draft_uses_plain_text_mode(tmp_path, monkeypatch) -> None:
    test_engine = create_engine(f"sqlite:///{(tmp_path / 'gateway.db').as_posix()}")
    SQLModel.metadata.create_all(test_engine)
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PROVIDER", "dashscope")
    monkeypatch.setenv("QWEN_API_KEY", "test-key")
    monkeypatch.setenv("QWEN_MODEL", "qwen-turbo")
    monkeypatch.setattr(
        model_gateway,
        "_live_target",
        lambda settings: model_gateway.LiveTarget(
            "dashscope",
            "https://example.invalid/chat/completions",
            "Bearer test-key",
            settings.qwen_model,
            True,
            0.5,
            1.5,
        ),
    )
    observed: dict[str, bool] = {}

    def fake_live_chat(url, auth_header, model, prompt, use_json_format):
        observed["use_json_format"] = use_json_format
        return "可供人工复核的百炼草稿", {"prompt_tokens": 10, "completion_tokens": 8}

    monkeypatch.setattr(model_gateway, "_live_chat", fake_live_chat)

    with Session(test_engine) as session:
        result = model_gateway.generate_task_draft(session, "project-test", "整理交付说明")

    assert observed["use_json_format"] is False
    assert result.execution_mode == "LIVE"
    assert result.degraded is False
    assert result.text == "可供人工复核的百炼草稿"
    test_engine.dispose()
