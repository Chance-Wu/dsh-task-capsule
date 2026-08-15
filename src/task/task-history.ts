/**
 * Recent-task history (design §12): a ring of finished tasks persisted to
 * `$DSH_HOME/task-capsule-history.json`, fed by the agent lifecycle.
 *
 * Every committed session event is folded into the session's capsule (the
 * same pure reducer the projection uses), and each agent running → idle
 * transition finalizes the open task into a {@link HistoryEntry}. The ring
 * is capped by the settings `historyLimit` (trimmed lazily on read so a
 * limit change takes effect without another push). Loads and writes are
 * best-effort: a missing or corrupt file silently falls back to an empty
 * ring, and a failed write only logs a warning.
 * @module dsh-task-capsule/task/task-history
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { readFile, writeFile } from 'node:fs/promises'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// Type-only: pulls the `session/event` and `agent/status` Events merges.
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type { CapsuleFiles, HistoryEntry, HistoryStatus } from '../types/capsule.ts'
import { historyStatusOf } from '../harness/task-mapper.ts'
import type { CapsuleFoldState } from '../harness/adapter.ts'
import { TaskManager } from './task-manager.ts'
import type { SettingsService } from './task-state.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The finished-task ring feeding the capsule's "recent tasks" section. */
    taskCapsuleHistory: TaskHistoryService
  }
}

/** Persisted history file under `$DSH_HOME` (flat, next to the settings file). */
const HISTORY_FILE = 'task-capsule-history.json'

/** The closed history-status set (wire values only; corrupt entries drop). */
const HISTORY_STATUSES: readonly HistoryStatus[] = ['success', 'failed', 'aborted', 'interrupted']

/**
 * Validate an untrusted (persisted or hand-edited) history payload into a
 * clean entry list, newest first, capped at `limit`. Rows that fail any
 * shape check are dropped individually so one corrupt row cannot sink the
 * rest of the file.
 */
export function sanitizeHistory(input: unknown, limit: number): HistoryEntry[] {
  if (!Array.isArray(input)) return []
  const out: HistoryEntry[] = []
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    if (typeof entry.sessionId !== 'string') continue
    const status = entry.status
    if (typeof status !== 'string' || !(HISTORY_STATUSES as readonly string[]).includes(status)) continue
    const startedAt = entry.startedAt
    const finishedAt = entry.finishedAt
    const durationMs = entry.durationMs
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) continue
    if (typeof finishedAt !== 'number' || !Number.isFinite(finishedAt)) continue
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) continue
    const completedTodos = entry.completedTodos
    const totalTodos = entry.totalTodos
    if (typeof completedTodos !== 'number' || !Number.isFinite(completedTodos)) continue
    if (typeof totalTodos !== 'number' || !Number.isFinite(totalTodos)) continue
    const files = sanitizeFiles(entry.files)
    if (files === undefined) continue
    out.push({
      sessionId: entry.sessionId,
      status: status as HistoryStatus,
      startedAt,
      finishedAt,
      durationMs,
      completedTodos,
      totalTodos,
      files,
    })
  }
  return out.length > limit ? out.slice(0, limit) : out
}

/** Narrow the persisted `files` shape; undefined when malformed. */
function sanitizeFiles(raw: unknown): CapsuleFiles | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const files = raw as Record<string, unknown>
  if (!Array.isArray(files.paths) || !files.paths.every(path => typeof path === 'string')) return undefined
  const additions = files.additions
  const deletions = files.deletions
  if (typeof additions !== 'number' || !Number.isFinite(additions)) return undefined
  if (typeof deletions !== 'number' || !Number.isFinite(deletions)) return undefined
  return { paths: files.paths as string[], additions, deletions }
}

export class TaskHistoryService extends Service {
  private readonly entries: HistoryEntry[] = []
  private readonly folds = new TaskManager()
  /** Sessions with an open (running) task; idle transitions finalize them. */
  private readonly open = new Set<string>()

  constructor(ctx: Context, private readonly settings: SettingsService) {
    super(ctx, 'taskCapsuleHistory')
    // Fold the session log into each session's capsule.
    this.ctx.on('session/event', (session, event) => {
      this.folds.observe(session.id, event)
    })
    // The lifecycle drives task boundaries: a running → idle transition
    // closes the open task (a later direct prompt opens the next one).
    this.ctx.on('agent/status', ({ agent, status }) => {
      const sessionId = agent.session.id
      if (status === 'running') {
        this.open.add(sessionId)
      } else if (status === 'idle' && this.open.delete(sessionId)) {
        const fold = this.folds.current(sessionId)
        if (fold !== undefined) this.push(finalize(sessionId, fold, Date.now()))
        this.folds.drop(sessionId)
      }
    })
    // Restore the persisted ring (best-effort; the default stands on error).
    void this.load()
  }

  /** Finished tasks, newest first, capped by the current settings limit. */
  list(): HistoryEntry[] {
    const cap = this.settings.get().historyLimit
    if (this.entries.length > cap) this.entries.length = cap
    return this.entries
  }

  private push(entry: HistoryEntry): void {
    this.entries.unshift(entry)
    const cap = this.settings.get().historyLimit
    if (this.entries.length > cap) this.entries.length = cap
    void this.persist()
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(dshHomePath(HISTORY_FILE), 'utf8')
      const restored = sanitizeHistory(JSON.parse(raw) as unknown, this.settings.get().historyLimit)
      this.entries.splice(0, this.entries.length, ...restored)
    } catch {
      // Missing or unreadable on first run: the empty ring already stands.
    }
  }

  private async persist(): Promise<void> {
    try {
      await writeFile(dshHomePath(HISTORY_FILE), `${JSON.stringify(this.entries, null, 2)}\n`, 'utf8')
    } catch (error) {
      this.ctx.logger.warn('task-capsule: failed to persist history: %s', error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * Turn a session's capsule fold into a history entry at `finishedAt` (the
 * moment the agent went idle). Extracted pure so tests can finalize without
 * a live cordis context.
 */
export function finalize(sessionId: string, fold: CapsuleFoldState, finishedAt: number): HistoryEntry {
  const capsule = fold.capsule
  const startedAt = capsule.startedAt ?? finishedAt
  const totalTodos = capsule.todos.length
  const completedTodos = capsule.todos.filter(todo => todo.status === 'completed').length
  return {
    sessionId,
    status: historyStatusOf(capsule.lastTurnEndReason ?? 'completed'),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    completedTodos,
    totalTodos,
    files: capsule.files,
  }
}
