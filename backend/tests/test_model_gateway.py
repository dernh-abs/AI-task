from sqlmodel import Session, SQLModel, create_engine

from app import model_gateway


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
        lambda settings: ("https://example.invalid/chat/completions", "Bearer test-key", settings.qwen_model, True),
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
