from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import Settings


class WeComApiError(RuntimeError):
    pass


@dataclass
class _TokenCache:
    access_token: str = ""
    expires_at: datetime = datetime.min.replace(tzinfo=timezone.utc)


_token_cache = _TokenCache()
_token_lock = threading.Lock()


class WeComDocumentsClient:
    api_base = "https://qyapi.weixin.qq.com/cgi-bin"

    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def configured(self) -> bool:
        return bool(self.settings.wecom_corp_id and self.settings.wecom_app_secret)

    def _json_request(self, url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise WeComApiError("企业微信接口暂时不可用") from exc
        if not isinstance(payload, dict):
            raise WeComApiError("企业微信返回了无效响应")
        errcode = int(payload.get("errcode", 0))
        if errcode:
            raise WeComApiError(f"企业微信接口返回错误码 {errcode}")
        return payload

    def access_token(self) -> str:
        if not self.configured:
            raise WeComApiError("尚未配置企业微信 CorpID 和自建应用 Secret")
        now = datetime.now(timezone.utc)
        with _token_lock:
            if _token_cache.access_token and _token_cache.expires_at > now + timedelta(minutes=5):
                return _token_cache.access_token
            query = urlencode({"corpid": self.settings.wecom_corp_id, "corpsecret": self.settings.wecom_app_secret})
            payload = self._json_request(f"{self.api_base}/gettoken?{query}")
            token = payload.get("access_token")
            if not isinstance(token, str) or not token:
                raise WeComApiError("企业微信未返回 access-token")
            expires_in = max(int(payload.get("expires_in", 7200)), 600)
            _token_cache.access_token = token
            _token_cache.expires_at = now + timedelta(seconds=expires_in)
            return token

    def connection_status(self) -> tuple[bool, bool, str]:
        if not self.configured:
            return False, False, "缺少企业微信 CorpID 或自建应用 Secret"
        try:
            self.access_token()
        except WeComApiError as exc:
            return True, False, str(exc)
        return True, True, "企业微信自建应用已连接"

    def create_document(
        self,
        *,
        doc_name: str,
        doc_type: int,
        admin_users: list[str],
        spaceid: str | None = None,
        fatherid: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"doc_name": doc_name, "doc_type": doc_type, "admin_users": admin_users}
        if spaceid:
            body["spaceid"] = spaceid
        if fatherid:
            body["fatherid"] = fatherid
        token = self.access_token()
        return self._json_request(f"{self.api_base}/wedoc/create_doc?{urlencode({'access_token': token})}", body)

    def get_document_base_info(self, docid: str) -> dict[str, Any]:
        token = self.access_token()
        return self._json_request(
            f"{self.api_base}/wedoc/get_doc_base_info?{urlencode({'access_token': token})}",
            {"docid": docid},
        )


def clear_token_cache() -> None:
    with _token_lock:
        _token_cache.access_token = ""
        _token_cache.expires_at = datetime.min.replace(tzinfo=timezone.utc)
