# Changelog

All notable changes to **dsh-task-capsule** are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [SemVer](https://semver.org/).

## [0.6.0] — 2026-08-16

### Changed (UI polish)

- **Disclosure arrows rotate** instead of swapping glyphs: the completed-task
  group and the subagent breakdown use a single `▸` that turns 90° to point
  down when open (160ms ease).
- **Status rhythm distinguishes working from waiting**: the running dot pulses
  faster (1.4s) with a slightly stronger halo, the waiting dot breathes
  slowly (2.6s) — the two states now feel different at a glance. The task
  tree's active-item dot follows the running rhythm.
- **Panel header divider**: a hairline under the title row separates the
  chrome from the content.
- **Running status word picks up the accent color**, so "working" reads
  without reading the text.
- **Semantic settle states**: the current-task accent bar and the progress
  fill both turn success-green once the plan is fully done (`data-done` /
  `data-complete`), with a smooth 200/300ms transition.
- **Recent-task rows get a leading status dot** (green success / red failure),
  making the ring scannable at a glance.
- **Chip press feedback**: `:active` yields the pill (scale 0.97) under the
  cursor, on top of the hover lift.
- **Settings page grouped** into Display / Behavior / Appearance / Debug
  sections with captions and hairline separators, plus hover tint on rows
  and a focus-visible background on the error toggle.
- All new transitions are disabled under `prefers-reduced-motion`.

## [0.5.0] — 2026-08-16

### Added

- **Plan-less current-operation line (functional gap)**: `showCurrentOp`
  only worked when a todo plan existed — `TaskTree` renders nothing without
  items. The live operation line is now a shared `CurrentOpLine` component
  that the panel renders under the current-task row when there is no plan,
  so plan-less runs finally say what the agent is doing (file / command).
- **Failure retry (functional gap)**: the failed task's error block now
  offers 「重试」beside `查看详情` — it re-queues a continuation prompt on
  the same session, matching the recent-task list affordance. Retrying no
  longer requires waiting for the task to land in history.
- **Expandable subagent breakdown (functional gap)**: the subagent aggregate
  row is now a disclosure toggle; expanding shows each child (display title,
  `done/total`, file count) from the `children` payload the REST endpoint
  already returned but the UI ignored.
- **Subagent progress refresh (functional gap)**: the parent summary now
  refreshes on a 5s cadence while children exist (subagent work advances
  independently of the parent's own activity, so the old turn-level refetch
  showed stale numbers); a session with no subagents still fetches once and
  never polls.
- **Localized retry prompt (functional gap)**: the retry continuation text
  was hardcoded Chinese `继续`; it now rides the new `panel.retryPrompt`
  locale key (`继续` / `Continue`).

### Fixed

- **Settings load race**: an edit issued right after startup could persist
  defaults + patch and drop previously saved fields. `update()` now awaits
  the persisted-file load before merging.
- **Host-side state leak**: `session/disposed` now releases the session's
  fold, frame count, open-task slot and subagent-parent registration, so
  long-running hosts stop accumulating stale per-session entries.
- **History file not trimmed on limit shrink**: `list()` now persists when a
  read actually trims the ring, bringing the file in line with a lowered
  `historyLimit`.

## [0.4.0] — 2026-08-16

### Fixed

- **History recorded one entry per turn-gap**: every `agent/status: idle`
  transition archived the open task, so a single multi-turn task polluted the
  recent ring with partial `success` rows. An idle with more queued work
  (`agent.inbox.hasPending`) or a blocked turn waiting on the user now keeps
  the task open; only a genuinely finished task is archived — one entry per
  task, matching the client's `turnGap` semantics.
- **`keepAfterDoneMs` was never wired**: the setting, its schema and its
  settings-panel control all existed, but the chip stayed visible forever
  after a task finished. The settled capsule now hides after the configured
  linger window (`0` = immediately), pinned by `alwaysVisible` or an open
  panel. `DEFAULT_KEEP_MS` is used as the pre-settings fallback.
- **Accent never reached the panel**: the portal panel renders in `<body>`,
  outside the chip root, so `--dsh-capsule-accent` (progress fill, bars,
  current-task bar) fell back to the default. The variable now rides the
  portal shell.

### Changed

- UI polish: chip hover lift / open-state ring / quiet success·error tints,
  breathing-dot halo, accent bar on the current-task row, gradient progress
  fill, hover states on task and recent rows, error block tinted by the
  semantic error color, settings toggles restyled as CSS switches, and
  focus-visible outlines — all still token-driven and reduced-motion aware.

### Removed

- Dead code: the duplicated `isTerminal` (now shared from `status.ts`), the
  unused `className` parameter of `StatusGlyph`, the dead `accent` prop and
  `data-accent` attribute of `CapsulePanel`, four unreferenced locale keys
  (`panel.currentOp`, `panel.error.detail`, `history.aborted`,
  `history.interrupted`), a stale panel docstring, and the duplicated
  label/full-label computation in `CapsuleChip`.

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
