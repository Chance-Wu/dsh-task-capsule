/**
 * Pure mappings between harness facts and capsule vocabulary.
 *
 * The todo timing merge is the fold's only multi-observation logic: the
 * agent replaces the whole list on every `todo/write`, so durations are
 * recovered by remembering the first time each `content` entered a state
 * (first-seen wins) and pruning entries that leave the list.
 * @module dsh-task-capsule/harness/task-mapper
 */

import type { TodoItem } from '@deepseek-ai/dsh-session'
import type { HistoryStatus, TaskItem } from '../types/capsule.ts'

/** content → observed transition timings within the current task. */
export interface TaskTiming {
  /** Unix epoch ms of the first `in_progress` observation. */
  startedAt?: number
  /** Unix epoch ms of the first `completed` observation. */
  completedAt?: number
}

/**
 * Merge a whole-list replacement into the running timing map and project the
 * current list with attached timings. Entries that left the list are pruned
 * so the map stays bounded by the plan size. Pure: never mutates `previous`.
 */
export function mergeTodos(
  previous: ReadonlyMap<string, TaskTiming>,
  todos: readonly TodoItem[],
  now: number,
): { timing: Map<string, TaskTiming>; items: TaskItem[] } {
  const timing = new Map<string, TaskTiming>()
  const items: TaskItem[] = []
  for (const todo of todos) {
    const carried = previous.get(todo.content)
    const next: TaskTiming = carried !== undefined ? { ...carried } : {}
    if (todo.status === 'in_progress' && next.startedAt === undefined) {
      next.startedAt = now
    }
    if (todo.status === 'completed' && next.completedAt === undefined) {
      next.completedAt = now
    }
    timing.set(todo.content, next)
    items.push({
      content: todo.content,
      status: todo.status,
      startedAt: next.startedAt,
      completedAt: next.completedAt,
    })
  }
  return { timing, items }
}

/**
 * Advance the plan on a successful turn end: the agent finished the step it
 * was working on, so the `in_progress` item becomes `completed` (the first
 * observed completion time is kept). This is the capsule's answer to the
 * agent moving on without a fresh `todo/write` — otherwise the plan would
 * stay stuck at `in_progress` even though the turn delivered. Failure and
 * stall reasons (`error`, `aborted`, `interrupted`, `blocked`, `max-tokens`)
 * leave the plan untouched: the capsule must not fake completion for a turn
 * that failed or needs a decision. Pure: never mutates its inputs.
 */
export function advanceOnTurnEnd(
  previous: ReadonlyMap<string, TaskTiming>,
  items: readonly TaskItem[],
  reason: string,
  now: number,
): { timing: ReadonlyMap<string, TaskTiming>; items: readonly TaskItem[] } {
  const timing = new Map(previous)
  let changed = false
  const nextItems = items.map(item => {
    if (item.status !== 'in_progress') return item
    const carried = timing.get(item.content) ?? { startedAt: item.startedAt }
    const next: TaskTiming = { ...carried, completedAt: carried.completedAt ?? now }
    timing.set(item.content, next)
    changed = true
    return { ...item, status: 'completed' as const, completedAt: next.completedAt }
  })
  if (!changed) return { timing: previous, items }
  return { timing, items: nextItems }
}

/**
 * Map a `turn/end` reason kind onto the history outcome classes. `blocked`
 * and `max-tokens` are not task failures — the run may continue or needs a
 * decision — so they land on `success` here (the live status derivation on
 * the client is what the user sees; history records the durable outcome).
 */
export function historyStatusOf(kind: string): HistoryStatus {
  switch (kind) {
    case 'error':
      return 'failed'
    case 'aborted':
      return 'aborted'
    case 'interrupted':
      return 'interrupted'
    default:
      return 'success'
  }
}
