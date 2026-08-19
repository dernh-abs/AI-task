from __future__ import annotations

import hashlib
import json
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


def _live_extract(content: str, api_key: str, model: str) -> tuple[CandidateExtraction, dict]:
    prompt = "从原文提取明确行动项。只返回 JSON：{\"candidates\":[{title,description,deliverable,owner_id,reviewer_id,due_at,confidence,evidence}]}。不明确的人员或日期填 null，不得猜测。原文：\n" + content
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}}).encode()
    api_request = request.Request("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", data=body, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with request.urlopen(api_request, timeout=25) as response:
        raw = json.loads(response.read())
    parsed = CandidateExtraction.model_validate_json(raw["choices"][0]["message"]["content"])
    return parsed, raw.get("usage", {})


def extract_candidates(session: Session, project_id: str, content: str) -> GatewayResult:
    settings = load_settings()
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
    live_requested = settings.ai_mode == "live" and bool(settings.qwen_api_key)
    today = datetime.now(timezone.utc).date().isoformat()
    spent = sum(row.cost_usd for row in session.exec(select(AiCallLog).where(AiCallLog.project_id == project_id)).all() if row.created_at.date().isoformat() == today)
    if live_requested and spent >= settings.ai_daily_budget_usd:
        data, mode, degraded, fallback_reason = _mock_extract(content), AiExecutionMode.FALLBACK, True, "BUDGET_EXCEEDED"
    elif live_requested and settings.qwen_api_key:
        last_error: Exception | None = None
        for _attempt in range(2):
            try:
                data, usage = _live_extract(content, settings.qwen_api_key, settings.qwen_model)
                mode = AiExecutionMode.LIVE
                break
            except ValidationError as exc:
                call_id = f"call-{uuid4().hex}"
                session.add(AiCallLog(id=call_id, project_id=project_id, capability="candidate_extraction", prompt_version=PROMPT_VERSION, model=settings.qwen_model, execution_mode=AiExecutionMode.LIVE, degraded=False, fallback_reason="SCHEMA_VALIDATION_FAILED", input_hash=input_hash, latency_ms=round((time.perf_counter() - started) * 1000), success=False))
                session.commit()
                raise GatewayOutputError("Model output failed schema validation") from exc
            except (OSError, KeyError, ValueError) as exc:
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
    session.add(AiCallLog(id=call_id, project_id=project_id, capability="candidate_extraction", prompt_version=PROMPT_VERSION, model=settings.qwen_model if mode == AiExecutionMode.LIVE else "deterministic-mock-v1", execution_mode=mode, degraded=degraded, fallback_reason=fallback_reason, input_hash=input_hash, latency_ms=latency_ms, input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost, success=True))
    result = GatewayResult(data=data, execution_mode=mode.value, degraded=degraded, fallback_reason=fallback_reason, call_id=call_id)
    session.add(AiResponseCache(cache_key=cache_key, response_json=result.model_dump_json()))
    return result


def generate_task_draft(session: Session, project_id: str, task_context: str) -> TextGatewayResult:
    settings = load_settings()
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
    live_requested = settings.ai_mode == "live" and bool(settings.qwen_api_key)
    today = datetime.now(timezone.utc).date().isoformat()
    spent = sum(row.cost_usd for row in session.exec(select(AiCallLog).where(AiCallLog.project_id == project_id)).all() if row.created_at.date().isoformat() == today)
    if live_requested and spent >= settings.ai_daily_budget_usd:
        mode, degraded, fallback_reason = AiExecutionMode.FALLBACK, True, "BUDGET_EXCEEDED"
    elif live_requested and settings.qwen_api_key:
        body = json.dumps({"model": settings.qwen_model, "messages": [{"role": "user", "content": "根据以下任务信息生成可直接人工复核的交付草稿，不要声称已完成未执行的外部动作：\n" + task_context}]}).encode()
        api_request = request.Request("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", data=body, headers={"Authorization": f"Bearer {settings.qwen_api_key}", "Content-Type": "application/json"})
        last_error: Exception | None = None
        for _attempt in range(2):
            attempt_count = _attempt + 1
            try:
                with request.urlopen(api_request, timeout=25) as response:
                    raw = json.loads(response.read())
                candidate_text = str(raw["choices"][0]["message"]["content"]).strip()
                if not candidate_text:
                    raise ValueError("empty model output")
                text, usage, mode = candidate_text, raw.get("usage", {}), AiExecutionMode.LIVE
                break
            except (OSError, KeyError, ValueError) as exc:
                last_error = exc
        else:
            mode, degraded, fallback_reason = AiExecutionMode.FALLBACK, True, type(last_error).__name__ if last_error else "LIVE_FAILED"
    call_id = f"call-{uuid4().hex}"
    input_tokens = int(usage.get("prompt_tokens", max(1, len(task_context) // 4)))
    output_tokens = int(usage.get("completion_tokens", max(1, len(text) // 4)))
    session.add(AiCallLog(id=call_id, project_id=project_id, capability="task_draft", prompt_version=prompt_version, model=settings.qwen_model if mode == AiExecutionMode.LIVE else "deterministic-mock-v1", execution_mode=mode, degraded=degraded, fallback_reason=fallback_reason, input_hash=input_hash, latency_ms=round((time.perf_counter() - started) * 1000), input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=(input_tokens * 0.0000005 + output_tokens * 0.0000015) if mode == AiExecutionMode.LIVE else 0, success=True))
    result = TextGatewayResult(text=text, execution_mode=mode.value, degraded=degraded, fallback_reason=fallback_reason, call_id=call_id, attempt_count=attempt_count)
    session.add(AiResponseCache(cache_key=cache_key, response_json=result.model_dump_json()))
    return result
