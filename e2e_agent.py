# -*- coding: utf-8 -*-
"""E2E agent-run test: login -> create task -> START -> start agent run (Ollama live)."""
import json
import urllib.request

BASE = "http://127.0.0.1:8000/api"


def call(method, path, token=None, payload=None, headers=None):
    h = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers:
        h.update(headers)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(BASE + path, data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else None


def main():
    login = call("POST", "/auth/login", payload={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"})
    token = login["access_token"]
    me = login["user"]
    print("LOGIN:", me["email"], me["role"], "uid=", me["id"])

    projects = call("GET", "/projects", token=token)
    pid = projects[0]["id"]
    print("PROJECT:", projects[0]["name"])

    task = call("POST", "/tasks", token=token, payload={
        "project_id": pid,
        "title": "AI 联动验证任务",
        "description": "编写一份智能饮食助手 App 的周推广计划初稿，包含渠道建议与预算分配。",
        "deliverable": "一份 500 字以内的推广计划初稿",
        "acceptance": "包含渠道、预算、排期三项",
        "owner_id": me["id"],
        "reviewer_id": me["id"],
    })
    print("CREATED_TASK:", task["id"], task["status"])

    start = call("POST", f"/tasks/{task['id']}/actions/START", token=token, payload={"expected_version": task["version"]}, headers={"Idempotency-Key": f"idem-start-{task['id']}"})
    print("AFTER_START:", start["task"]["status"])

    run_resp = call("POST", f"/tasks/{task['id']}/agent-runs", token=token)
    run = run_resp["run"]
    print("AGENT_RUN: status=", run["status"], "execution_mode=", run["execution_mode"], "degraded=", run["degraded"])
    print("OUTPUT_PREVIEW:", (run.get("output_text") or "")[:160].replace("\n", " "))

    task_after = call("GET", f"/tasks?project_id={pid}", token=token)
    updated = [t for t in task_after if t["id"] == task["id"]][0]
    print("TASK_STATUS_AFTER:", updated["status"])


if __name__ == "__main__":
    main()
