# AI Task 薄 CLI

CLI 只调用 FastAPI，不连接 PostgreSQL，也不包含任何领域状态机副本。

安装后可使用 `ai-task` 命令：

```bash
cd backend
python -m pip install -e .
```

配置：

```bash
export AI_TASK_BASE_URL="https://quanyigeo.com/ai-task/api"
export AI_TASK_TOKEN="登录接口返回的访问令牌"
```

常用命令：

```bash
ai-task projects list
ai-task projects status PROJECT_ID
ai-task projects decompose PROJECT_ID --instruction "按两周内可验收交付物拆解" --max-candidates 8
ai-task candidates list --project-id PROJECT_ID
ai-task candidates update CANDIDATE_ID --version 1 --owner-id USER_ID --reviewer-id USER_ID --execution-mode HYBRID
ai-task candidates confirm CANDIDATE_ID --version 2
ai-task tasks list --project-id PROJECT_ID
```

供 Codex 或脚本调用时增加 `--json`。登录命令不会接受明文密码参数，密码从安全提示或临时环境变量 `AI_TASK_PASSWORD` 读取。

