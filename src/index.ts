/**
 * dsh-task-capsule — an always-visible, expandable status capsule for the
 * task DeepSeek Harness is running (design: "Task Capsule").
 *
 * Host half: composes the `taskCapsule` session projection (the pure fold
 * that turns harness events into the capsule's durable facts), the
 * recent-task history service, the runtime settings service, and the tiny
 * HTTP surface for history/settings. Everything is optional composition —
 * headless assemblies without the web server or the projection seam simply
 * skip the corresponding wiring.
 *
 * The browser half (`./client`) registers the capsule into the session
 * header utilities and a settings section.
 * @module dsh-task-capsule
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CapsuleSettings } from './types/capsule.ts'
import { applyCapsuleProjection } from './harness/adapter.ts'
import { SettingsService } from './task/task-state.ts'
import { TaskHistoryService } from './task/task-history.ts'
import { applyRoutes } from './api/routes.ts'

/** Plugin identity used by the Cordis loader. */
export const name = 'task-capsule'

/** Patch-config surface; every field optional so a row may set only some. */
export interface Config extends Partial<CapsuleSettings> {}

/** Schemastery schema for the loader row config (fields are optional by default). */
export const Config: z<Config> = z.object({
  keepAfterDoneMs: z.number(),
  autoExpandFailed: z.boolean(),
  historyLimit: z.union([z.const(3), z.const(5), z.const(10)]),
  showDuration: z.boolean(),
  showCurrentOp: z.boolean(),
  alwaysVisible: z.boolean(),
  showProgress: z.boolean(),
  density: z.union([z.const('comfortable'), z.const('compact')]),
  accent: z.union([z.const('auto'), z.const('business'), z.const('success'), z.const('warn'), z.const('error')]),
  traceFrames: z.boolean(),
})

/** Design §13 defaults, applied before the patch config is merged. */
const DEFAULT_SETTINGS: CapsuleSettings = {
  keepAfterDoneMs: 8000,
  autoExpandFailed: false,
  historyLimit: 5,
  showDuration: true,
  showCurrentOp: true,
  alwaysVisible: false,
  showProgress: true,
  density: 'comfortable',
  accent: 'auto',
  traceFrames: false,
}

/** Compose the task capsule into the host. */
export function apply(ctx: Context, config: Config): void {
  const settings = new SettingsService(ctx, { ...DEFAULT_SETTINGS, ...config })
  ctx.plugin(TaskHistoryService, settings)
  applyCapsuleProjection(ctx)
  applyRoutes(ctx)
}

export type { CapsuleState, CapsuleSettings, HistoryEntry, TaskItem, CapsuleStatus } from './types/capsule.ts'
export type { TaskHistoryService } from './task/task-history.ts'
export type { SettingsService } from './task/task-state.ts'
