from __future__ import annotations

import json
from dataclasses import replace

from app.config import load_settings
from app.email_delivery import build_invitation_message, send_invitation_email
from app.wecom_documents import WeComDocumentsClient, clear_token_cache


def test_invitation_email_not_configured_does_not_attempt_delivery() -> None:
    settings = replace(
        load_settings(),
        smtp_host=None,
        smtp_username=None,
        smtp_password=None,
        smtp_from_email=None,
    )
    assert send_invitation_email(
        settings,
        recipient="member@example.com",
        team_name="测试团队",
        inviter_name="邀请人",
        activation_token="private-token",
    ) == "NOT_CONFIGURED"


def test_invitation_email_uses_smtp_without_exposing_password(monkeypatch) -> None:
    sent = []

    class FakeSmtp:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def login(self, username, password):
            assert username == "sender@example.com"
            assert password == "smtp-secret"

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr("app.email_delivery.smtplib.SMTP_SSL", FakeSmtp)
    settings = replace(
        load_settings(),
        public_app_url="https://example.com/ai-task/",
        smtp_host="smtp.example.com",
        smtp_username="sender@example.com",
        smtp_password="smtp-secret",
        smtp_from_email="sender@example.com",
    )
    result = send_invitation_email(
        settings,
        recipient="member@example.com",
        team_name="测试团队",
        inviter_name="邀请人",
        activation_token="private-token",
    )
    assert result == "SENT"
    assert len(sent) == 1
    assert "smtp-secret" not in sent[0].as_string()
    assert "private-token" in sent[0].get_body(preferencelist=("plain",)).get_content()


def test_invitation_message_escapes_html() -> None:
    settings = replace(load_settings(), smtp_from_email="sender@example.com")
    message = build_invitation_message(
        settings,
        recipient="member@example.com",
        team_name="<团队>",
        inviter_name="<邀请人>",
        activation_url="https://example.com/?invite=token&next=1",
    )
    html_body = message.get_body(preferencelist=("html",)).get_content()
    assert "&lt;团队&gt;" in html_body
    assert "invite=token&amp;next=1" in html_body


def test_wecom_token_is_cached_and_not_added_to_document_body(monkeypatch) -> None:
    calls: list[tuple[str, bytes | None]] = []

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps(self.payload).encode()

    def fake_urlopen(request, timeout):
        assert timeout == 10
        calls.append((request.full_url, request.data))
        if "gettoken" in request.full_url:
            return FakeResponse({"errcode": 0, "access_token": "server-only-token", "expires_in": 7200})
        return FakeResponse({"errcode": 0, "docid": "doc-1", "doc_url": "https://doc.example.com/doc-1"})

    monkeypatch.setattr("app.wecom_documents.urlopen", fake_urlopen)
    clear_token_cache()
    settings = replace(load_settings(), wecom_corp_id="ww-corp", wecom_app_secret="app-secret")
    client = WeComDocumentsClient(settings)

    assert client.access_token() == "server-only-token"
    assert client.access_token() == "server-only-token"
    result = client.create_document(doc_name="项目周报", doc_type=10, admin_users=["zhangsan"])

    assert result["docid"] == "doc-1"
    assert sum("gettoken" in url for url, _ in calls) == 1
    document_body = json.loads(next(data for url, data in calls if "create_doc" in url))
    assert "access_token" not in document_body
    assert document_body == {"doc_name": "项目周报", "doc_type": 10, "admin_users": ["zhangsan"]}
