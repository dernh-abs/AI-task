# -*- coding: utf-8 -*-
"""E2E verification client: login -> candidate extraction -> report LIVE/FALLBACK."""
import json
import urllib.request

BASE = "http://127.0.0.1:8000/api"


def post(path, payload, token=None):
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    login = post("/auth/login", {"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"})
    token = login["access_token"]
    print("LOGIN:", login["user"]["email"], login["user"]["role"])
    projects = get("/projects", token)
    pid = projects[0]["id"]
    print("PROJECT:", projects[0]["name"], "id=", pid)

    samples = [
        "周一项目启动会上，决定由张三负责首页改版，李四负责接口联调，都需要在周五前提交评审稿。另外要采购一台测试机。",
        "客户反馈登录页加载慢，王五需在周三前优化首屏性能，赵六负责编写压测报告。",
        "演示：小明要在下周一把市场推广方案初稿写出来，小红负责联系三家供应商询价，周五前给结果。",
    ]
    for idx, sample in enumerate(samples):
        resp = post("/candidate-extractions", {
            "project_id": pid,
            "source_type": "MEETING",
            "title": f"e2e{idx}",
            "content": sample,
        }, token)
        print(f"\nRUN{idx}: mode={resp['execution_mode']} degraded={resp['degraded']} cached={resp['cached']} count={len(resp['candidates'])}")
        for c in resp["candidates"]:
            print(f"   - {c['title']} | owner={c['owner_id']} | conf={c['confidence']} | due={c['due_at']}")


if __name__ == "__main__":
    main()
