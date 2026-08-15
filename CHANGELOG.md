# Changelog

All notable changes to **dsh-task-capsule** are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [SemVer](https://semver.org/).

## [0.2.0] — 2026-08-15

### Added

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
