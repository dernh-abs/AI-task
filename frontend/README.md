# 全意 AI Task OS Demo

面向内部产品评审的桌面端可交互 Demo，使用 React、TypeScript、Tailwind CSS 和 Vite 构建。数据保存在浏览器 `localStorage`，不依赖后端或登录。

## 运行

```bash
pnpm install
pnpm dev
```

生产构建与预览：

```bash
pnpm build
pnpm preview
```

也可以直接打开根目录的 `design-preview.html`，它会进入当前 `dist/` 构建产物。团队成员视角为默认入口，CEO 视角使用 `design-preview.html?role=ceo`。

## 推荐演示路径

1. **候选任务确认**：快捷入口 → 候选任务 → 查看来源 → 修改后创建或确认创建。
2. **会议任务接收**：确认会议候选任务 → 我的任务 → 打开新任务 → 员工确认接收或退回补充。
3. **AI 执行与验收**：AI 执行状态 → 推进排队/执行/完成 → 我的任务 → 人工确认并验收。
4. **等待外部**：我的任务 → 打开任务 → 转等待外部 → 等待外部列表；再次打开可恢复、结束或创建后续任务。
5. **求助与积分**：求助 → AI 初答未解决 → 人工回答 → 标记解决 → 我的贡献查看新增积分。

侧边栏底部的“重置 Demo 数据”可以恢复初始状态。

## 产品文档

- `01-product-definition.md`：产品定义
- `02-information-architecture.md`：信息架构
- `03-user-flows.md`：核心用户流程
- `04-wireframe-spec.md`：低保真原型规格
- `05-prd.md`：PRD
- `06-demo-build-prompt.md`：Demo 构建要求
- `07-ai-capability-and-computation-spec.md`：AI能力、人工审核、模型路由、RAG、算法与开发实施规格
