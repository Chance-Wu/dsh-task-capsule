# dsh-task-capsule

> An always-visible, expandable task-status pill for the DeepSeek Harness session header — "what is it doing, how far along, how long has it taken", with almost no noise.

DeepSeek Harness 的任务胶囊插件：把 Harness 的执行过程收敛成一个**始终可见、几乎不打扰**的任务状态指示器——「状态 → 任务计数 → 时间」。二期（Interaction Polish）砍掉了所有管理形态的 UI；三期在本仓库落地的迭代里，**把「最近任务列表」和「设置中心」从砍掉清单里拿了回来**，同时补上折叠层的正确性修复（turn 结束完成度推断、帧洪峰抑制）。

```
● 任务 已完成3 进行中1 待处理5 · 02:18          ← 紧凑胶囊（会话头部）
│   点击展开
▼
┌─ Task Capsule ✕ ──────────────────────────┐
│ ● 执行中                                   │
│ 通读现状:ChangeEvent/History…     01:42    │ ← 当前任务（无活动项时显示「全部完成」）
│ 改动 3 个文件 · +12 −4                      │ ← 文件统计（fs 工具 diff 折叠）
│  ✓ 通读现状:ChangeEvent/HistoryService      │
│  ● 4.1 Change Timeline:Focus 迷你时间轴     │ ← 当前 > 已完成 > 等待
│  ○ 4.5 Safe Apply:prepare/validate          │
│ ── 最近任务 ────────── 今日 3 · 成功率 67% · │ ← 历史环形缓冲 + 轻量统计
│  ✓ 任务完成       5/5  02:31                │
└────────────────────────────────────────────┘
```

## 功能

- **紧凑胶囊**（会话头部右侧）：`● 任务 已完成3 进行中1 待处理5 · 02:18`——状态点 + 任务计数（已完成/进行中/待处理）+ 时钟式耗时（`MM:SS`，超一小时 `HH:MM:SS`；未开始显示 `—`）。耗时以弱化的等宽时钟呈现，并用「·」与前面的状态文字隔开；胶囊变窄时仅状态文字省略，时钟始终可见。
  - 未使用 todo 计划时会话固定显示「会话任务处理」。
  - 终态胶囊收起为记录：`✓ 任务完成 5/5 · 02:31`（状态词 + 已完成/总数 + 冻结耗时，不随页面刷新增长）。
  - 运行/等待中的状态点是**呼吸动画**（轻微透明度脉动），不是转圈。
  - 配置 `alwaysVisible: true` 可让胶囊在会话空闲、无任何活动时也保持显示。
- **展开面板**（胶囊"长大"成面板，180ms morph 过渡）：
  - 头部 `Task Capsule ×`（× 关闭；ESC / 点击外部同样收起）。
  - 状态行（glyph + 状态词；等待时附带原因，如 `等待确认 · bash`）。
  - 当前任务行（名称强调 + 耗时；列表存在但无进行中项时显示「全部完成」）。
  - **文件统计行**：`改动 3 个文件 · +12 −4`（来自 fs 工具 `tool/result` 的 diff 折叠）。
  - 任务列表，视觉层级严格 **当前 > 已完成 > 等待**；当前任务行下方显示当前操作（正在编辑的文件 / 执行的命令，超长两端保留截断）。
  - 失败块：一行错误摘要 + `查看详情` 折叠展开，**不放日志查看器**。
  - **最近任务**：宿主持久化环形缓冲（`$DSH_HOME/task-capsule-history.json`，重启不丢）的紧凑列表——状态词 + 完成数 + 耗时，顶部一行轻量统计（`今日 N · 成功率 X% · 平均 MM:SS`）。
- **生命周期**：任务完成后面板 1.5s 自动收起，胶囊保留完成态（时长可配）；失败不强制打断（可配置自动展开）。状态切换、任务切换均为 150~220ms 内的轻动画，无烟花/Toast/弹窗。
- **设置中心**：设置面板里注册了「任务胶囊」页，五个显示开关 + 保留时长 + 历史容量全部可运行时调整（写回 `/api/task-capsule/settings`，与 yaml 配置同源）。

## 语义（为什么胶囊和聊天可能"看起来不同步"）

- **任务状态唯一来自 agent 的 `todo_write` 工具**（整表替换，last-write-wins）。聊天里的 todo 工具卡显示的是 agent 写入的同一份数据；如果 agent 在最终消息里口头说"完成"却没再写一次 todo 列表，胶囊会如实停留在最后一次写入的状态。
- **回合结束推断**：`turn/end` 且 reason 为 `completed` 时，当前 `in_progress` 项自动升级为 `completed`（补齐 agent 换任务前漏写的那一步）。失败/中止/中断/等待决策（`error` / `aborted` / `interrupted` / `blocked` / `max-tokens`）**不**做推断——胶囊不为失败的回合伪造完成。
- **回合间隔**：框架的 `todos` 投影在 `turn/start` 清空（聊天 TodoPanel 两轮之间空白），胶囊**保留**列表跨回合——两者语义不同，但都是"如实反映"。

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
- **帧洪峰抑制**：`tool/result` 不带 diff 时折叠返回同一引用，投影驱动层不产生帧——一次长会话里 `taskCapsule` 的帧数从「每个工具调用一帧」降到「每个 turn/todo 写一帧」量级。

## 配置

显示开关可走 profile 的 `cordis.patch.yml`，也可在**设置面板 → 任务胶囊**里运行时调整（后者写回 `$DSH_HOME/task-capsule.json`）：

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
        alwaysVisible: false    # 空闲无活动时也保持胶囊可见
```

## HTTP API（前缀 `/api/task-capsule`）

| 资源 | 说明 |
|------|------|
| `GET /settings` · `PUT /settings` | 显示开关（胶囊启动时 GET 一次；PUT 供设置中心/程序化配置） |
| `GET /history` | 最近完成的任务（宿主侧归档，面板「最近任务」区消费） |

胶囊数据本身全部走既有投影/会话快照通道，无 SSE、无轮询。

## 开发

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run（折叠/归档/设置清洗/状态派生/格式化 + jsdom 组件测试）
pnpm build         # tsc + tsdown（浏览器半边打包 lib/client.js）
pnpm dev:watch     # 宿主半边 tsc --watch + 浏览器半边 tsdown --watch
```

> Harness 的 web profile 直接加载本包 `lib/` 下的构建产物（`main: lib/index.js`、`./client → lib/client.js`）。**改 `src/` 后必须 `pnpm build`，再刷新浏览器页面**才会生效——`prepare` 钩子保证 git 方式安装时自动构建，日常开发用 `pnpm dev:watch` 免手动重建。

## 目录

```
src/
├── index.ts            # 插件入口：Config schema + 组合宿主半边
├── types/capsule.ts    # 线模型 + taskCapsule 投影键声明（两半共享）
├── harness/            # 事件 → 胶囊模型（纯折叠，可重放）
│   ├── adapter.ts      # 投影注册 + 折叠（turn 结束推断、帧洪峰抑制）
│   ├── event-parser.ts # 事件分类/窄化（direct prompt、diff meta、goal phase）
│   └── task-mapper.ts  # todo 计时合并、turn 结局映射
├── task/
│   ├── task-manager.ts # 按会话折叠存储
│   ├── task-history.ts # 历史环形缓冲（持久化）+ agent 生命周期归档
│   └── task-state.ts   # 设置服务 + 持久化
├── api/routes.ts       # REST 路由（history / settings）
└── client/             # 浏览器半边
    ├── index.ts        # 注册 header.utilities 胶囊 + settings.section 设置页
    ├── CapsuleChip.tsx / CapsulePanel.tsx / StatusGlyph.tsx
    ├── TaskTree.tsx / HistoryList.tsx / SettingsSection.tsx
    ├── status.ts / format.ts（progressLabel / historyStats）
    ├── api.ts          # /api/task-capsule 的 settings GET/PUT + history GET 客户端
    └── locales.ts
```

## 边界（仍明确砍掉）

❌ 进度条/百分比　❌ 日志面板　❌ 任务搜索/筛选/标签/优先级/暂停/重试/拖拽　❌ 自定义主题　❌ Dashboard/数据分析　❌ 内置 To-dos 条改动。

胶囊只做一件事：**随时可感知、几乎不打扰地告诉你「现在在干什么、做到哪了、花了多久」**。
