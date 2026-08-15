/**
 * The task-capsule projection unit: a pure fold over the session log that
 * turns harness events into the capsule's durable facts (design §7-8).
 *
 * The harness produces events; this adapter converts them into the capsule
 * model. The fold is replay-safe (every fact is derivable from the log), so
 * the projection survives reloads and reseeds like the `todos` projection it
 * sits beside. Live status (running/waiting) is NOT folded here — the
 * browser half derives it from the live session snapshot.
 *
 * Task boundary: a `user/message` with source kind `user` (a direct human
 * prompt) opens a new task and resets per-task facts. Everything else
 * accumulates into the open task.
 * @module dsh-task-capsule/harness/adapter
 */

import type { Context } from '@deepseek-ai/cordis'
import { z as zod } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Type-only: resolves ctx.sessionProjections and pulls the `taskCapsule`
// projection-key merge (declared in ../types/capsule.ts) into scope.
import type {} from '@deepseek-ai/dsh-session-projection'
import type { CapsuleFiles, CapsuleState } from '../types/capsule.ts'
import { addDiffs, diffsFromMeta, goalPhaseOf, isDirectPrompt } from './event-parser.ts'
import { mergeTodos, type TaskTiming } from './task-mapper.ts'

/** Internal fold state: the wire capsule plus the todo timing map. */
export interface CapsuleFoldState {
  capsule: CapsuleState
  /** content → timings accumulated across whole-list replacements. */
  timing: Map<string, TaskTiming>
}

/** Fresh file statistics (no mutations shared between fold states). */
export function emptyFiles(): CapsuleFiles {
  return { paths: [], additions: 0, deletions: 0 }
}

/** A capsule with no plan and no activity yet. */
export function emptyCapsule(startedAt?: number): CapsuleState {
  return { todos: [], startedAt, files: emptyFiles() }
}

/** Fold state for an empty log. */
export function initialFold(): CapsuleFoldState {
  return { capsule: emptyCapsule(), timing: new Map() }
}

/**
 * Pure transition: previous fold + one committed event → next fold. An event
 * the capsule does not consume MUST return the same reference (zero
 * downstream work). Only low-frequency events are handled, so every handled
 * event simply builds a fresh capsule.
 */
export function applyFold(state: CapsuleFoldState, event: SessionEvent): CapsuleFoldState {
  // A direct human prompt opens a new task: reset every per-task fact.
  if (isDirectPrompt(event)) {
    return { capsule: emptyCapsule(event.time), timing: new Map() }
  }
  const capsule = state.capsule
  switch (event.type) {
    case 'turn/start': {
      const startedAt = capsule.startedAt ?? event.time
      return { ...state, capsule: { ...capsule, startedAt, lastActivityAt: event.time } }
    }
    case 'turn/end':
      return { ...state, capsule: { ...capsule, lastTurnEndReason: event.data.reason.kind, lastActivityAt: event.time } }
    case 'todo/write': {
      const merged = mergeTodos(state.timing, event.data.todos, event.time)
      return { ...state, timing: merged.timing, capsule: { ...capsule, todos: merged.items, lastActivityAt: event.time } }
    }
    case 'tool/result': {
      const diffs = diffsFromMeta(event.data.meta)
      if (diffs === undefined) {
        return { ...state, capsule: { ...capsule, lastActivityAt: event.time } }
      }
      return { ...state, capsule: { ...capsule, files: addDiffs(capsule.files, diffs), lastActivityAt: event.time } }
    }
    default: {
      // goal/change rides a plugin-merged session event, so it is handled
      // outside the closed switch (the goal plugin may not be composed).
      const phase = goalPhaseOf(event)
      if (phase === undefined || phase === capsule.goalPhase) return state
      return { ...state, capsule: { ...capsule, goalPhase: phase, lastActivityAt: event.time } }
    }
  }
}

/** Wire schema for the `taskCapsule` projection value. */
const taskItemSchema = zod.object({
  content: zod.string(),
  status: zod.union([zod.literal('pending'), zod.literal('in_progress'), zod.literal('completed')]),
  startedAt: zod.number().optional(),
  completedAt: zod.number().optional(),
})

const capsuleSchema = zod.object({
  todos: zod.array(taskItemSchema),
  startedAt: zod.number().optional(),
  lastActivityAt: zod.number().optional(),
  lastTurnEndReason: zod.string().optional(),
  goalPhase: zod.union([
    zod.literal('active'), zod.literal('paused'), zod.literal('blocked'), zod.literal('complete'),
  ]).optional(),
  files: zod.object({
    paths: zod.array(zod.string()),
    additions: zod.number(),
    deletions: zod.number(),
  }),
})

/**
 * Register the `taskCapsule` projection unit. Activates only when the
 * session-projection seam is composed (headless assemblies without it stay
 * unaffected) and disposes with the registrant context.
 */
export function applyCapsuleProjection(ctx: Context): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'taskCapsule', CapsuleFoldState>({
      key: 'taskCapsule',
      schema: capsuleSchema,
      init: initialFold,
      apply: applyFold,
      view: state => state.capsule,
      stateVersion: 1,
    })
  })
}
