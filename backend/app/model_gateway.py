from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timezone
from typing import Literal
from urllib import request
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session, select

from .config import load_settings
from .models import AiCallLog, AiExecutionMode, AiResponseCache


PROMPT_VERSION = "candidate-extract-v1"

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class ExtractedCandidate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = ""
    deliverable: str = Field(min_length=1, max_length=300)
    owner_id: str | None = None
    reviewer_id: str | None = None
    due_at: datetime | None = None
    confidence: int = Field(ge=0, le=100)
    evidence: str = Field(min_length=1, max_length=500)


class CandidateExtraction(BaseModel):
    candidates: list[ExtractedCandidate] = Field(max_length=20)


class GatewayResult(BaseModel):
    data: CandidateExtraction
    execution_mode: Literal["LIVE", "MOCK", "FALLBACK"]
    degraded: bool
    fallback_reason: str | None = None
    cached: bool = False
    call_id: str


class GatewayOutputError(Exception):
    pass


class TextGatewayResult(BaseModel):
    text: str
    execution_mode: Literal["LIVE", "MOCK", "FALLBACK"]
    degraded: bool
    fallback_reason: str | None = None
    cached: bool = False
    call_id: str
    attempt_count: int = 1


def _mock_extract(content: str) -> CandidateExtraction:
    lines = [line.strip(" -\t") for line in content.splitlines() if len(line.strip(" -\t")) >= 4]
    if not lines:
        lines = [content.strip() or "补充待办事项"]
    candidates = [ExtractedCandidate(title=line[:80], deliverable=f"完成并提交：{line[:100]}", confidence=80, evidence=line[:300]) for line in lines[:5]]
    return CandidateExtraction(candidates=candidates)


def _live_target(settings) -> tuple[str, str | None, str, bool]:
    """Return (url, auth_header_or_None, model, use_json_format).

    For the local Ollama provider we hit the OpenAI-compatible endpoint with no auth
    header, and we deliberately do NOT send response_format (small local models handle
    a strongly-worded JSON instruction + few-shot example far more reliably than the
    json_object mode). DashScope keeps response_format.
    """
    if settings.ai_provider == "ollama":
        base = settings.ollama_base_url.rstrip("/")
        return f"{base}/chat/completions", None, settings.ollama_model, False
    return (
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        f"Bearer {settings.qwen_api_key}",
        settings.qwen_model,
        True,
    )


def _live_chat(url: str, auth_header: str | None, model: str, prompt: str, use_json_format: bool) -> tuple[str, dict]:
    body: dict = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    if use_json_format:
        body["response_format"] = {"type": "json_object"}
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if auth_header:
        headers["Authorization"] = auth_header
    api_request = request.Request(url, data=data, headers=headers)
    # Local Ollama can be slower than a hosted API; generous timeout.
    with request.urlopen(api_request, timeout=90) as response:
        raw = json.loads(response.read())
    content = str(raw["choices"][0]["message"]["content"]).strip()
    if not content:
        raise ValueError("empty model output")
    return content, raw.get("usage", {})


def _coerce_json_object(text: str) -> dict:
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            obj = json.loads(text[start:end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    raise ValueError("no json object found in model output")


def _parse_due(value) -> datetime | None:
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        if "T" in s or " " in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        return datetime.combine(datetime.fromisoformat(s).date(), datetime.min.time())
    except ValueError:
        return None


def _sanitize_candidates(obj: dict) -> list[ExtractedCandidate]:
    """Turn a loosely-structured model response into validated candidates.

    Small local models often return null fields, floats for confidence, or names
    instead of user ids. We recover what we can and drop items that are unusable so
    a partially-broken response still yields real candidates instead of failing hard.
    """
    raw_list = obj.get("candidates") if isinstance(obj, dict) else None
    if not isinstance(raw_list, list):
        return []
    out: list[ExtractedCandidate] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        deliverable = str(item.get("deliverable") or "").strip()
        if len(title) < 2:
            # Recover using the deliverable as the title when the title is missing.
            if len(deliverable) >= 2:
                title = deliverable[:80]
            else:
                continue
        if not deliverable:
            continue
        owner_raw = item.get("owner_id")
        reviewer_raw = item.get("reviewer_id")
        owner_id = owner_raw if isinstance(owner_raw, str) and _UUID_RE.match(owner_raw) else None
        reviewer_id = reviewer_raw if isinstance(reviewer_raw, str) and _UUID_RE.match(reviewer_raw) else None
        try:
            conf = int(float(item["confidence"])) if item.get("confidence") is not None else 70
        except (ValueError, TypeError, KeyError):
            conf = 70
        conf = max(0, min(100, conf))
        evidence = str(item.get("evidence") or title).strip() or title
        out.append(ExtractedCandidate(
            title=title[:160],
            description=str(item.get("description") or "").strip()[:300],
            deliverable=deliverable[:300],
            owner_id=owner_id,
            reviewer_id=reviewer_id,
            due_at=_parse_due(item.get("due_at")),
            confidence=conf,
            evidence=evidence[:500],
        ))
    return out


def _build_extract_prompt(content: str) -> str:
    example = (
        "示例输入：周一启动会，张三负责首页改版，李四做接口联调，都需要在周五前提交评审稿。\n"
        "示例输出：{\"candidates\":[{\"title\":\"首页改版\",\"description\":\"负责首页改版设计与开发\","
        "\"deliverable\":\"提交首页改版评审稿\",\"owner_id\":\"张三\",\"reviewer_id\":null,"
        "\"due_at\":\"周五前\",\"confidence\":85,\"evidence\":\"周一启动会决定由张三负责首页改版\"}]}"
    )
    return (
        "你是会议纪要行动项提取助手。请从文本中提取明确的待办行动项。\n"
        "只输出一个 JSON 对象，不要任何解释或 markdown。结构为：\n"
        "{\"candidates\":[{\"title\":字符串,\"description\":字符串,\"deliverable\":字符串,"
        "\"owner_id\":姓名或null,\"reviewer_id\":姓名或null,\"due_at\":原文日期或null,"
        "\"confidence\":0到100的整数,\"evidence\":字符串}]}\n"
        "规则：每个候选必须填写 title（简短动作标题，至少2个字）和 deliverable（具体交付物）；"
        "人员用姓名或null；日期保留原文或null；confidence 为 0-100 的整数；最多提取 8 条；"
        "不要编造原文没有的人员或日期。\n"
        f"{example}\n\n待提取文本：\n{content}"
    )


def extract_candidates(session: Session, project_id: str, content: str) -> GatewayResult:
    settings = load_settings()
    live_model = settings.ollama_model if settings.ai_provider == "ollama" else settings.qwen_model
    input_hash = hashlib.sha256(content.encode()).hexdigest()
    cache_key = hashlib.sha256(f"{project_id}:{PROMPT_VERSION}:{input_hash}".encode()).hexdigest()
    cached = session.get(AiResponseCache, cache_key)
    if cached:
        stored = json.loads(cached.response_json)
        return GatewayResult(data=CandidateExtraction.model_validate(stored["data"]), execution_mode=stored["execution_mode"], degraded=stored["degraded"], fallback_reason=stored.get("fallback_reason"), cached=True, call_id=stored["call_id"])
    started = time.perf_counter()
    mode = AiExecutionMode.MOCK
    degraded = False
    fallback_reason = None
    usage: dict = {}
    live_requested = settings.ai_mode == "live" and (
        settings.ai_provider == "ollama" or bool(settings.qwen_api_key)
    )
    today = datetime.now(timezone.utc).date().isoformat()
    spent = sum(row.cost_usd for row in session.exec(select(AiCallLog).where(AiCallLog.project_id == project_id)).all() if row.created_at.date().isoformat() == today)
    if live_requested and spent >= settings.ai_daily_budget_usd:
        data, mode, degraded, fallback_reason = _mock_extract(content), AiExecutionMode.FALLBACK, True, "BUDGET_EXCEEDED"
    elif live_requested:
        url, auth_header, model, use_json = _live_target(settings)
        prompt = _build_extract_prompt(content)
        last_error: Exception | None = None
        for _attempt in range(3):
            try:
                raw_text, usage = _live_chat(url, auth_header, model, prompt, use_json)
                candidates = _sanitize_candidates(_coerce_json_object(raw_text))
                if not candidates:
                    raise ValueError("model returned no usable candidates")
                data = CandidateExtraction(candidates=candidates)
                mode = AiExecutionMode.LIVE
                break
            except (OSError, KeyError, ValueError, ValidationError) as exc:
                last_error = exc
        else:
            data, mode, degraded, fallback_reason = _mock_extract(content), AiExecutionMode.FALLBACK, True, type(last_error).__name__ if last_error else "LIVE_FAILED"
    else:
        data = _mock_extract(content)
    latency_ms = round((time.perf_counter() - started) * 1000)
    input_tokens = int(usage.get("prompt_tokens", max(1, len(content) // 4)))
    output_tokens = int(usage.get("completion_tokens", max(1, len(data.model_dump_json()) // 4)))
    cost = (input_tokens * 0.0000005 + output_tokens * 0.0000015) if mode == AiExecutionMode.LIVE else 0
    call_id = f"call-{uuid4().hex}"
    recorded_model = live_model if mode == AiExecutionMode.LIVE else "deterministic-mock-v1"
    session.add(AiCallLog(id=call_id, project_id=project_id, capability="candidate_extraction", prompt_version=PROMPT_VERSION, model=recorded_model, execution_mode=mode, degraded=degraded, fallback_reason=fallback_reason, input_hash=input_hash, latency_ms=latency_ms, input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost, success=True))
    result = GatewayResult(data=data, execution_mode=mode.value, degraded=degraded, fallback_reason=fallback_reason, call_id=call_id)
    session.add(AiResponseCache(cache_key=cache_key, response_json=result.model_dump_json()))
    return result


def generate_task_draft(session: Session, project_id: str, task_context: str) -> TextGatewayResult:
    settings = load_settings()
    live_model = settings.ollama_model if settings.ai_provider == "ollama" else settings.qwen_model
    prompt_version = "task-draft-v1"
    input_hash = hashlib.sha256(task_context.encode()).hexdigest()
    cache_key = hashlib.sha256(f"{project_id}:{prompt_version}:{input_hash}".encode()).hexdigest()
    cached = session.get(AiResponseCache, cache_key)
    if cached:
        stored = json.loads(cached.response_json)
        stored["cached"] = True
        return TextGatewayResult(**stored)
    started = time.perf_counter()
    mode, degraded, fallback_reason, usage, attempt_count = AiExecutionMode.MOCK, False, None, {}, 1
    text = f"AI 草稿\n\n基于任务上下文完成初稿：\n{task_context}\n\n请负责人核对事实、补充证据并确认后提交验收。"
    live_requested = settings.ai_mode == "live" and (
        settings.ai_provider == "ollama" or bool(settings.qwen_api_key)
    )
    today = datetime.now(timezone.utc).date().isoformat()
    spent = sum(row.cost_usd for row in session.exec(select(AiCallLog).where(AiCallLog.project_id == project_id)).all() if row.created_at.date().isoformat() == today)
    if live_requested and spent >= settings.ai_daily_budget_usd:
        mode, degraded, fallback_reason = AiExecutionMode.FALLBACK, True, "BUDGET_EXCEEDED"
    elif live_requested:
        url, auth_header, model, _use_json = _live_target(settings)
        prompt = "根据以下任务信息生成可直接人工复核的交付草稿，不要声称已完成未执行的外部动作：\n" + task_context
        last_error: Exception | None = None
        for _attempt in range(2):
            attempt_count = _attempt + 1
            try:
                # Task drafts are free-form text. DashScope rejects json_object mode
                # when the prompt does not explicitly request a JSON response.
                candidate_text, usage = _live_chat(url, auth_header, model, prompt, False)
                if not candidate_text:
                    raise ValueError("empty model output")
                text, mode = candidate_text, AiExecutionMode.LIVE
                break
            except (OSError, KeyError, ValueError) as exc:
                last_error = exc
        else:
            mode, degraded, fallback_reason = AiExecutionMode.FALLBACK, True, type(last_error).__name__ if last_error else "LIVE_FAILED"
    recorded_model = live_model if mode == AiExecutionMode.LIVE else "deterministic-mock-v1"
    call_id = f"call-{uuid4().hex}"
    input_tokens = int(usage.get("prompt_tokens", max(1, len(task_context) // 4)))
    output_tokens = int(usage.get("completion_tokens", max(1, len(text) // 4)))
    session.add(AiCallLog(id=call_id, project_id=project_id, capability="task_draft", prompt_version=prompt_version, model=recorded_model, execution_mode=mode, degraded=degraded, fallback_reason=fallback_reason, input_hash=input_hash, latency_ms=round((time.perf_counter() - started) * 1000), input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=(input_tokens * 0.0000005 + output_tokens * 0.0000015) if mode == AiExecutionMode.LIVE else 0, success=True))
    result = TextGatewayResult(text=text, execution_mode=mode.value, degraded=degraded, fallback_reason=fallback_reason, call_id=call_id, attempt_count=attempt_count)
    session.add(AiResponseCache(cache_key=cache_key, response_json=result.model_dump_json()))
    return result
