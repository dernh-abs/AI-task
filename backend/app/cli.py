from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
from typing import Any
from urllib import error, parse, request
from uuid import uuid4


DEFAULT_BASE_URL = "http://localhost:8000/api"


class CliApiError(RuntimeError):
    def __init__(self, status: int, detail: Any):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def call(self, method: str, path: str, payload: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        request_headers = {"Accept": "application/json"}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        if self.token:
            request_headers["Authorization"] = f"Bearer {self.token}"
        request_headers.update(headers or {})
        api_request = request.Request(f"{self.base_url}{path}", data=body, headers=request_headers, method=method)
        try:
            with request.urlopen(api_request, timeout=120) as response:
                raw = response.read()
        except error.HTTPError as exc:
            try:
                detail = json.loads(exc.read().decode("utf-8")).get("detail", exc.reason)
            except (ValueError, AttributeError):
                detail = exc.reason
            raise CliApiError(exc.code, detail) from exc
        except error.URLError as exc:
            raise CliApiError(0, f"无法连接 AI Task API：{exc.reason}") from exc
        return json.loads(raw.decode("utf-8")) if raw else None


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ai-task", description="AI Task 的无状态 API CLI；所有写操作仍由服务端权限、版本和幂等规则校验。")
    parser.add_argument("--base-url", default=os.getenv("AI_TASK_BASE_URL", DEFAULT_BASE_URL), help="API 根地址，默认读取 AI_TASK_BASE_URL")
    parser.add_argument("--token", default=os.getenv("AI_TASK_TOKEN"), help="访问令牌，建议使用 AI_TASK_TOKEN 环境变量")
    parser.add_argument("--json", action="store_true", help="输出紧凑 JSON，便于 Codex 或脚本解析")
    groups = parser.add_subparsers(dest="group", required=True)

    auth = groups.add_parser("auth", help="认证")
    auth_commands = auth.add_subparsers(dest="command", required=True)
    login = auth_commands.add_parser("login", help="登录并输出访问令牌；密码从 AI_TASK_PASSWORD 或安全提示读取")
    login.add_argument("--email", required=True)

    projects = groups.add_parser("projects", help="项目读取与拆解")
    project_commands = projects.add_subparsers(dest="command", required=True)
    project_commands.add_parser("list", help="列出项目")
    status = project_commands.add_parser("status", help="读取单项目真实进度、状态数量和成员负荷")
    status.add_argument("project_id")
    decompose = project_commands.add_parser("decompose", help="生成候选小任务，不直接创建正式任务")
    decompose.add_argument("project_id")
    decompose.add_argument("--instruction", default="")
    decompose.add_argument("--max-candidates", type=int, default=8, choices=range(1, 21), metavar="1..20")

    candidates = groups.add_parser("candidates", help="候选任务审核")
    candidate_commands = candidates.add_subparsers(dest="command", required=True)
    candidate_list = candidate_commands.add_parser("list", help="列出候选")
    candidate_list.add_argument("--project-id")
    candidate_update = candidate_commands.add_parser("update", help="修改候选；必须提供当前版本")
    candidate_update.add_argument("candidate_id")
    candidate_update.add_argument("--version", type=int, required=True)
    candidate_update.add_argument("--title")
    candidate_update.add_argument("--description")
    candidate_update.add_argument("--deliverable")
    candidate_update.add_argument("--stage-id")
    candidate_update.add_argument("--owner-id")
    candidate_update.add_argument("--reviewer-id")
    candidate_update.add_argument("--execution-mode", choices=["HUMAN", "AI", "HYBRID"])
    candidate_update.add_argument("--due-at")
    candidate_confirm = candidate_commands.add_parser("confirm", help="人工确认候选并创建正式任务")
    candidate_confirm.add_argument("candidate_id")
    candidate_confirm.add_argument("--version", type=int, required=True)
    candidate_confirm.add_argument("--idempotency-key", default=None)

    tasks = groups.add_parser("tasks", help="正式任务读取")
    task_commands = tasks.add_subparsers(dest="command", required=True)
    task_list = task_commands.add_parser("list", help="列出正式任务")
    task_list.add_argument("--project-id")
    return parser


def _require_token(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    if args.group != "auth" and not args.token:
        parser.error("该命令需要 --token 或 AI_TASK_TOKEN")


def _execute(args: argparse.Namespace, client: ApiClient) -> Any:
    if args.group == "auth" and args.command == "login":
        password = os.getenv("AI_TASK_PASSWORD") or getpass.getpass("登录密码：")
        return client.call("POST", "/auth/login", {"email": args.email, "password": password})
    if args.group == "projects" and args.command == "list":
        return client.call("GET", "/projects")
    if args.group == "projects" and args.command == "status":
        return client.call("GET", f"/projects/{parse.quote(args.project_id, safe='')}/task-overview")
    if args.group == "projects" and args.command == "decompose":
        return client.call("POST", f"/projects/{parse.quote(args.project_id, safe='')}/decompositions", {"instruction": args.instruction, "max_candidates": args.max_candidates})
    if args.group == "candidates" and args.command == "list":
        suffix = f"?project_id={parse.quote(args.project_id, safe='')}" if args.project_id else ""
        return client.call("GET", f"/candidates{suffix}")
    if args.group == "candidates" and args.command == "update":
        payload: dict[str, Any] = {"expected_version": args.version}
        for argument, field in (("title", "title"), ("description", "description"), ("deliverable", "deliverable"), ("stage_id", "stage_id"), ("owner_id", "owner_id"), ("reviewer_id", "reviewer_id"), ("execution_mode", "execution_mode"), ("due_at", "due_at")):
            value = getattr(args, argument)
            if value is not None:
                payload[field] = None if value.lower() == "none" else value
        return client.call("PATCH", f"/candidates/{parse.quote(args.candidate_id, safe='')}", payload)
    if args.group == "candidates" and args.command == "confirm":
        key = args.idempotency_key or f"cli-{uuid4().hex}"
        return client.call("POST", f"/candidates/{parse.quote(args.candidate_id, safe='')}/confirm", {"expected_version": args.version}, {"Idempotency-Key": key})
    if args.group == "tasks" and args.command == "list":
        suffix = f"?project_id={parse.quote(args.project_id, safe='')}" if args.project_id else ""
        return client.call("GET", f"/tasks{suffix}")
    raise RuntimeError("unsupported command")


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    _require_token(args, parser)
    client = ApiClient(args.base_url, args.token)
    try:
        result = _execute(args, client)
    except CliApiError as exc:
        print(json.dumps({"ok": False, "status": exc.status, "error": exc.detail}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":") if args.json else None, indent=None if args.json else 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
