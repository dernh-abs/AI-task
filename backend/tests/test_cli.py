from __future__ import annotations

import json

from app import cli


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode()


def test_cli_project_status_uses_token_and_same_api(monkeypatch, capsys) -> None:
    captured = {}

    def open_request(api_request, timeout):
        captured["url"] = api_request.full_url
        captured["authorization"] = api_request.headers.get("Authorization")
        captured["timeout"] = timeout
        return FakeResponse({"project_id": "p-1", "progress": 42})

    monkeypatch.setattr(cli.request, "urlopen", open_request)
    result = cli.main(["--base-url", "https://example.test/api", "--token", "secret-token", "--json", "projects", "status", "p-1"])
    assert result == 0
    assert captured == {"url": "https://example.test/api/projects/p-1/task-overview", "authorization": "Bearer secret-token", "timeout": 120}
    assert json.loads(capsys.readouterr().out)["progress"] == 42


def test_cli_decompose_posts_only_to_api(monkeypatch, capsys) -> None:
    captured = {}

    def open_request(api_request, timeout):
        captured["method"] = api_request.method
        captured["payload"] = json.loads(api_request.data.decode())
        captured["timeout"] = timeout
        return FakeResponse({"candidates": [], "execution_mode": "MOCK"})

    monkeypatch.setattr(cli.request, "urlopen", open_request)
    result = cli.main(["--token", "token", "projects", "decompose", "p-1", "--instruction", "按交付物拆解", "--max-candidates", "6"])
    assert result == 0
    assert captured["method"] == "POST"
    assert captured["payload"] == {"instruction": "按交付物拆解", "max_candidates": 6}
    assert json.loads(capsys.readouterr().out)["execution_mode"] == "MOCK"
