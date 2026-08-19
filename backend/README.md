# Backend

## 启动

```powershell
python -m venv .venv
.venv\Scripts\pip install -e ".[test]"
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

首次启动会在空库写入本地演示账号：

- 成员：`member@quanyi.local` / `mvp-member-2026`
- CEO：`ceo@quanyi.local` / `mvp-ceo-2026`

这些凭据仅用于本地 MVP，正式部署必须关闭种子数据并替换 JWT 密钥。
