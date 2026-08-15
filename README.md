# dsh-task-capsule

> An always-visible, expandable task-status pill for the DeepSeek Harness session header — "what is it doing, how far along, how long has it taken", with almost no noise.

DeepSeek Harness 的任务胶囊插件：把 Harness 的执行过程收敛成一个**始终可见、几乎不打扰**的任务状态指示器——默认只承担「状态 → 任务计数 → 时间」，二期（Interaction Polish）刻意砍掉了所有管理形态的 UI。

## 功能（二期形态）

- **紧凑胶囊**（会话头部右侧）：`● 任务 已完成3 进行中1 待处理5 02:18`——状态点 + 任务计数（已完成/进行中/待处理）+ 时钟式耗时（`MM:SS`，超一小时 `HH:MM:SS`；未开始显示 `—`）。未使用 todo 计划时会话退回显示会话标题。
  - 终态胶囊收起为记录：`✓ 任务完成 02:31`（耗时冻结，不随页面刷新增长）。
  - 运行/等待中的状态点是**呼吸动画**（轻微透明度脉动），不是转圈。
- **展开面板**（胶囊"长大"成面板，180ms morph 过渡）：
  - 头部 `Task Capsule ×`（× 关闭；ESC / 点击外部同样收起）。
  - 状态行（glyph + 状态词；等待时附带原因，如 `等待确认 · bash`）。
  - 当前任务行（名称强调 + 耗时）。
  - 任务列表，视觉层级严格 **当前 > 已完成 > 等待**；当前任务行下方显示当前操作（正在编辑的文件 / 执行的命令）。
  - 失败块：一行错误摘要 + `查看详情` 折叠展开，**不放日志查看器**。
- **生命周期**：任务完成后面板 1.5s 自动收起，胶囊保留完成态（时长可配）；失败不强制打断（可配置自动展开）。状态切换、任务切换均为 150~220ms 内的轻动画，无烟花/Toast/弹窗。

## 架构

```
Harness session 日志（append-only）
   │ session/event
   ▼
taskCapsule 投影（纯折叠）──session/projection 帧──▶ useProjection('taskCapsule')
   │                                                    │
   ▼                                                    ▼
task-history（agent 生命周期归档，宿主侧）──REST──▶ 客户端（useSession 快照合成状态）
```

- **任务计划**来自 agent 的 `todo_write` 工具；不用 todo 时胶囊退化为「状态 + 耗时」。
- **状态**由客户端从实时快照合成：`running` / 等待 → `waiting`，turn 结局 + `lastAgentError` → `success/failed`，goal phase → `paused`。
- 任务边界 = 一条直接人类提示词。
- 宿主侧仍记录完成历史（`$DSH_HOME/task-capsule-history.json`，重启不丢），供后续表面使用；**UI 不再展示最近任务**。

## 配置

显示开关走 profile 的 `cordis.patch.yml`（二期无设置中心 UI）：

```yaml
- insert:
    - id: task-capsule
      name: dsh-task-capsule
      config:
        keepAfterDoneMs: 8000   # 完成态胶囊保留时长（0 = 立即收缩）
        autoExpandFailed: false # 失败时自动展开面板
        historyLimit: 5         # 最近任务历史环形缓冲容量（3 | 5 | 10）
        showDuration: true      # 展开态显示逐任务耗时
        showCurrentOp: true     # 显示当前操作行
```

> `historyLimit` 保留在宿主设置中（历史环形缓冲容量），无 UI 修改入口。

## HTTP API（前缀 `/api/task-capsule`）

| 资源 | 说明 |
|------|------|
| `GET /settings` · `PUT /settings` | 显示开关（胶囊启动时 GET 一次；PUT 供程序化配置） |
| `GET /history` | 最近完成的任务（宿主侧归档，当前无 UI 消费方） |

胶囊数据本身全部走既有投影/会话快照通道，无 SSE、无轮询。

## 开发

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run（折叠/归档/设置清洗/状态派生/格式化纯函数）
pnpm build       # tsc + tsdown（浏览器半边打包 lib/client.js）
```

## 目录

```
src/
├── index.ts            # 插件入口：Config schema + 组合宿主半边
├── types/capsule.ts    # 线模型 + taskCapsule 投影键声明（两半共享）
├── harness/            # 事件 → 胶囊模型（纯折叠，可重放）
│   ├── adapter.ts      # 投影注册 + 折叠
│   ├── event-parser.ts # 事件分类/窄化（direct prompt、diff meta、goal phase）
│   └── task-mapper.ts  # todo 计时合并、turn 结局映射
├── task/
│   ├── task-manager.ts # 按会话折叠存储
│   ├── task-history.ts # 历史环形缓冲（持久化）+ agent 生命周期归档
│   └── task-state.ts   # 设置服务 + 持久化
├── api/routes.ts       # REST 路由（history / settings）
└── client/             # 浏览器半边
    ├── index.ts        # 注册 header.utilities 胶囊
    ├── CapsuleChip.tsx / CapsulePanel.tsx / StatusGlyph.tsx
    ├── TaskTree.tsx / status.ts / format.ts
    ├── api.ts          # /api/task-capsule 的 settings GET/PUT 客户端
    └── locales.ts
```

## 边界（二期明确砍掉）

❌ 最近任务 UI　❌ 设置中心　❌ 进度条/百分比　❌ 文件统计　❌ 日志面板　❌ 任务搜索/筛选/标签/优先级/统计/暂停/重试/拖拽　❌ 自定义主题　❌ Dashboard/数据分析　❌ 内置 To-dos 条改动。

胶囊只做一件事：**随时可感知、几乎不打扰地告诉你「现在在干什么、做到哪了、花了多久」**。
