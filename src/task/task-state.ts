/**
 * Capsule settings service: runtime-tunable settings (design §13) with
 * `$DSH_HOME/task-capsule.json` persistence on top of the patch-config
 * defaults. Loading is best-effort — an unreadable or missing file (first
 * run) silently keeps the defaults; only known keys are merged, so a hand
 * edited file cannot smuggle in invalid values.
 * @module dsh-task-capsule/task/task-state
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { readFile, writeFile } from 'node:fs/promises'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { CapsuleSettings } from '../types/capsule.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The runtime-editable task-capsule settings. */
    taskCapsuleSettings: SettingsService
  }
}

/** Persisted settings file under `$DSH_HOME`. */
const SETTINGS_FILE = 'task-capsule.json'

/** Valid history capacities (design §13: 3 / 5 / 10). */
const HISTORY_LIMITS: readonly number[] = [3, 5, 10]

/** Valid panel densities. */
const DENSITIES: readonly string[] = ['comfortable', 'compact']

/** Valid accent selections. */
const ACCENTS: readonly string[] = ['auto', 'business', 'success', 'warn', 'error']

/** Clamp a keep-after-done duration to sane bounds (0 = hide immediately). */
const MAX_KEEP_MS = 60_000

/** Coerce one candidate into a validated partial settings object. */
export function sanitizeSettings(input: unknown): Partial<CapsuleSettings> {
  if (typeof input !== 'object' || input === null) return {}
  const raw = input as Record<string, unknown>
  const out: Partial<CapsuleSettings> = {}
  if (typeof raw.keepAfterDoneMs === 'number') {
    out.keepAfterDoneMs = Math.min(MAX_KEEP_MS, Math.max(0, Math.trunc(raw.keepAfterDoneMs)))
  }
  if (typeof raw.autoExpandFailed === 'boolean') out.autoExpandFailed = raw.autoExpandFailed
  if (typeof raw.autoExpandRunning === 'boolean') out.autoExpandRunning = raw.autoExpandRunning
  if (typeof raw.showDuration === 'boolean') out.showDuration = raw.showDuration
  if (typeof raw.showCurrentOp === 'boolean') out.showCurrentOp = raw.showCurrentOp
  if (typeof raw.alwaysVisible === 'boolean') out.alwaysVisible = raw.alwaysVisible
  if (typeof raw.showProgress === 'boolean') out.showProgress = raw.showProgress
  if (typeof raw.traceFrames === 'boolean') out.traceFrames = raw.traceFrames
  if (typeof raw.density === 'string' && DENSITIES.includes(raw.density)) {
    out.density = raw.density as CapsuleSettings['density']
  }
  if (typeof raw.accent === 'string' && ACCENTS.includes(raw.accent)) {
    out.accent = raw.accent as CapsuleSettings['accent']
  }
  if (typeof raw.historyLimit === 'number' && HISTORY_LIMITS.includes(raw.historyLimit)) {
    out.historyLimit = raw.historyLimit as 3 | 5 | 10
  }
  return out
}

export class SettingsService extends Service {
  private current: CapsuleSettings
  /** The persisted-file load; `update` awaits it so a startup edit never
   *  overwrites a previously saved setting with defaults (load race). */
  private readonly loading: Promise<void>

  constructor(ctx: Context, defaults: CapsuleSettings) {
    super(ctx, 'taskCapsuleSettings')
    this.current = { ...defaults }
    this.loading = this.load()
  }

  /** The current settings (defaults until the persisted file loads). */
  get(): CapsuleSettings {
    return this.current
  }

  /** Merge a validated partial, persist, and return the new settings. */
  async update(patch: Partial<CapsuleSettings>): Promise<CapsuleSettings> {
    // Wait for the persisted file to merge first — otherwise a settings-panel
    // edit issued right after startup would persist defaults + patch and drop
    // every previously saved field.
    await this.loading
    this.current = { ...this.current, ...sanitizeSettings(patch) }
    try {
      await writeFile(dshHomePath(SETTINGS_FILE), `${JSON.stringify(this.current, null, 2)}\n`, 'utf8')
    } catch (error) {
      this.ctx.logger.warn('task-capsule: failed to persist settings: %s', error instanceof Error ? error.message : String(error))
    }
    return this.current
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(dshHomePath(SETTINGS_FILE), 'utf8')
      this.current = { ...this.current, ...sanitizeSettings(JSON.parse(raw) as unknown) }
    } catch {
      // Missing or unreadable on first run: defaults already stand.
    }
  }
}
