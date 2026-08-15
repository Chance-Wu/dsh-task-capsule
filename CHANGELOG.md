# Changelog

All notable changes to **dsh-task-capsule** are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [SemVer](https://semver.org/).

## [0.3.0] — 2026-08-15

### Added

- **P0-1 subagent aggregation**: the panel shows the parent session's
  delegated work — `◈ 子代理 N · 已完成x 进行中y 待处理z · f 文件` — folded
  host-side (children registered via `header.parentSession` +
  `delegationDepth`) and served over `GET /api/task-capsule/parent`.
- **P0-2 retry chain**: new history entries link back to the same session's
  latest failed attempt (`retriedFrom`); the recent list shows a
  「重试 N 次」 badge computed from the ring.
- **P0-3 frame telemetry**: taskCapsule projection frames are counted per
  session (via `sessionProjections.onChanged`), reset on each direct prompt,
  archived as `frames` in the history entry and shown in the row tooltip.
- **P0-4 turn count**: the fold counts turns per task; a plan-less finished
  run reads `✓ 任务完成 · 5 回合 · 02:31`.
- **P1-5 panel flip**: the floating panel flips above the chip when the
  space below is too small (ResizeObserver re-anchors on content growth),
  with a caret pointing back at the chip.
- **P1-6 focus management**: focus moves into the panel on open, Tab traps
  inside it, focus returns to the chip on close, and status changes are
  announced via a polite `aria-live` region.
- **P1-7/P1-8/P1-9 task list**: the active item flashes on switch; completed
  items group under a collapsed toggle; each item shows a thin duration bar
  relative to the longest item.

### Changed

- Subagent child folds are retained (not dropped on idle) so the parent's
  aggregation can read the current delegated work; child sessions still
  produce no history entries of their own.

## [0.2.0] — 2026-08-15

### Added

- **Auto-expand while running** (`autoExpandRunning`, default on): the panel
  opens on the task's running edge so the live plan is visible, and **morphs
  back to the compact chip when the plan is fully completed** (or empty);
  failed/stalled plans stay open.
- **Liquid floating panel**: the expanded panel is portaled to `<body>` and
  `position: fixed` under the chip (right-aligned) — never clipped by the
  session header or scroll containers, re-anchored on scroll/resize, and
  elevated above all content. The surface is liquid: translucent glass
  (`backdrop-filter` blur), organic meniscus border-radius, and a top
  sheen; a 420 ms droplet settle-in (radius/blur morph) leads into a
  perpetual 5.5 s micro-float, and the exit is a 230 ms droplet-drain back
  toward the chip. `prefers-reduced-motion` is respected. `react-dom` was
  added as a devDependency (externalized at build time; resolves through
  the platform module table at runtime).
- **Recent-task list** in the expanded panel: the host's persisted ring
  (`/api/task-capsule/history`) with a one-line stats summary
  (today / week / success rate / average duration). Rows open the source
  session; failed rows surface the turn/end reason and offer a **retry**
  that re-queues a continuation prompt.
- **Settings center**: a `settings.section` page (nav label 任务胶囊 /
  Task Capsule) writing to the plugin's own settings resource — toggles for
  durations, current op, progress bar, auto-expand-on-failure, always
  visible, frame tracing; selects for panel density, accent, and history
  capacity; the completion-linger duration field.
- **Terminal chip progress**: finished tasks read
  `✓ 任务完成 5/5 · 02:31` (status word + done/total + frozen clock).
- **File-change summary line** (`改动 3 个文件 · +12 −4`), folded from fs
  tool result diffs.
- **Progress bar**: a thin done/total bar under the current task row
  (`showProgress`, default on).
- **Goal objective line** from the framework `goal` projection.
- **Turn-gap status** (`回合间隔` / Between turns): an idle agent with more
  queued work no longer flashes the terminal record between turns, and the
  panel no longer auto-collapses on a turn boundary.
- **Tool-name badge** on the current-operation row; both-ends clipping.
- **alwaysVisible** setting (pins the capsule on idle sessions).
- **Panel density** (comfortable / compact) and **accent** (auto /
  business / success / warn / error) settings.
- **traceFrames** debug setting: console-trace projection updates.
- Tooling: `prepare` + `dev:watch` scripts, `packageManager` pin,
  GitHub Actions CI, jsdom component tests, fold fuzz + integration specs.

### Changed

- **Fold semantics**: a `turn/end` with reason `completed` advances the
  `in_progress` item to done (the plan converges when the agent moves on
  without rewriting it). Failure/stall reasons never fake completion.
- **Frame-storm guard**: `tool/result` without diffs returns the same fold
  reference — long sessions no longer churn a projection frame per tool
  call; `lastActivityAt` is a turn-level fact.
- Projection `stateVersion` bumped to 2 so stale persisted checkpoints
  refold after the semantics change.
- Subagent sessions are excluded from the recent-task ring (child work
  rides the parent's task; cross-session folding is out of framework
  scope).
- History entries may carry the failing `turn/end` reason (`error`).

### Fixed

- The settings section had **no nav title** (missing locale-aware `label`);
  it now reads 任务胶囊 / Task Capsule.

## [0.1.0] — 2026-08-15

- Initial release: the always-visible, expandable task-status capsule
  (status → task counts → clock), the pure fold, the history ring, the
  settings service, the REST surface, and the README/CI scaffolding.
