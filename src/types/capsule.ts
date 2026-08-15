/**
 * Wire types of the task capsule — the ONE home of the `taskCapsule`
 * projection-key declaration plus its payload types, free of this package's
 * host-side value imports (cordis, zod). Both halves import this module:
 * the host fold registers the key, the browser half reads it through
 * `useProjection('taskCapsule')`, and the type-only merge keeps the two on
 * the same shape.
 *
 * The projection carries everything the browser half cannot derive from the
 * live session snapshot: per-plan-item timings, accumulated file statistics,
 * and the last turn outcome. Status (running/waiting) comes from the live
 * snapshot, so it deliberately does NOT ride this projection.
 * @module dsh-task-capsule/types
 */

// Type-only, from the pure-types outlet (not the package root): the root
// declares host Context merges (`ctx.sessions: SessionStore`) that must not
// enter the browser half's type graph, where the runtime's `ISessions`
// merge lives. Same outlet tool-todo uses for its client aggregates.
import type { TodoItem } from '@deepseek-ai/dsh-session/types'

/**
 * The capsule's presentation status (design §4; `skipped` has no producer
 * today, so it is not a wire member — the union is closed for the UI).
 */
export type CapsuleStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'paused'
  | 'waiting'

/**
 * One plan entry with the timings the fold observes. The todo list is
 * replaced wholesale on every write (last-write-wins), so entries need no
 * stable identity — the fold keys the timing map by `content`.
 */
export interface TaskItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  /** Unix epoch ms when this item first entered `in_progress` (absent = never active). */
  startedAt?: number
  /** Unix epoch ms when this item became `completed` (absent = not completed). */
  completedAt?: number
}

/** Accumulated file-change statistics from `tool/result` diff metadata. */
export interface CapsuleFiles {
  /** Unique touched paths, in first-touch order. */
  paths: string[]
  /** Summed added lines. */
  additions: number
  /** Summed removed lines. */
  deletions: number
}

/**
 * The task-capsule projection value: the durable facts of the current task
 * (folded from the session log, replay-safe), minus the live status.
 */
export interface CapsuleState {
  /** Current plan (latest `todo/write`); empty while the agent is not using todos. */
  todos: TaskItem[]
  /** Unix epoch ms when the current task began (first direct prompt). */
  startedAt?: number
  /** Unix epoch ms of the most recent activity event. */
  lastActivityAt?: number
  /** `kind` of the most recent `turn/end`, absent before the first turn ends. */
  lastTurnEndReason?: string
  /** goal phase when the goal plugin is composed (absent without it). */
  goalPhase?: 'active' | 'paused' | 'blocked' | 'complete'
  files: CapsuleFiles
}

/** Outcome classes the history ring keeps (design §12). */
export type HistoryStatus = 'success' | 'failed' | 'aborted' | 'interrupted'

/** One finished task in the recent-history ring. */
export interface HistoryEntry {
  sessionId: string
  status: HistoryStatus
  /** Unix epoch ms when the task began. */
  startedAt: number
  /** Unix epoch ms when the task ended. */
  finishedAt: number
  durationMs: number
  completedTodos: number
  totalTodos: number
  files: CapsuleFiles
}

/** Runtime-tunable settings (design §13); defaults ride the patch config. */
export interface CapsuleSettings {
  /** Show per-item durations in the expanded panel. */
  showDuration: boolean
  /** Show the current operation line in the expanded panel. */
  showCurrentOp: boolean
  /** How long the completion state lingers before the capsule hides; 0 = hide immediately. */
  keepAfterDoneMs: number
  /** Auto-expand a failed task to surface its error entry. */
  autoExpandFailed: boolean
  /** Recent-history ring capacity. */
  historyLimit: 3 | 5 | 10
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** The task-capsule fold for the current session. */
    taskCapsule: CapsuleState
  }
}

export type { TodoItem }
