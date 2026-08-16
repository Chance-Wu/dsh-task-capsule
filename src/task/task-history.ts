/**
 * Recent-task history (design §12) + subagent aggregation + frame telemetry:
 * a ring of finished tasks persisted to `$DSH_HOME/task-capsule-history.json`,
 * fed by the agent lifecycle. Every committed session event is folded into
 * the session's capsule (the same pure reducer the projection uses), and
 * each agent running → idle transition finalizes the open task into a
 * {@link HistoryEntry}.
 *
 * Beyond the ring, the service is the host-side owner of two facts the
 * per-session projection cannot express:
 * - **subagent aggregation (P0-1)**: child sessions (`delegationDepth > 0`
 *   with a `parentSession`) are registered under their parent, and
 *   `parentSummary()` folds their current-task capsule facts into one
 *   {@link ParentSummary} served over REST — the panel shows the whole
 *   delegation tree's progress.
 * - **frame telemetry (P0-3)**: taskCapsule projection frames are counted
 *   per session through the registry's `onChanged`, reset on each direct
 *   prompt, and archived in the history entry (`frames`).
 *
 * The ring is capped by the settings `historyLimit` (trimmed lazily on read
 * so a limit change takes effect without another push). Loads and writes
 * are best-effort: a missing or corrupt file silently falls back to an
 * empty ring, and a failed write only logs a warning.
 * @module dsh-task-capsule/task/task-history
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { readFile, writeFile } from 'node:fs/promises'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// Type-only: pulls the `session/event` and `agent/status` Events merges.
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type { CapsuleFiles, CapsuleState, ChildSummary, HistoryEntry, HistoryStatus, ParentSummary } from '../types/capsule.ts'
import { historyStatusOf } from '../harness/task-mapper.ts'
import { isDirectPrompt } from '../harness/event-parser.ts'
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

/** Identity of one history entry, stable across ring churn (P0-2). */
function entryId(entry: { sessionId: string; startedAt: number }): string {
  return `${entry.sessionId}:${entry.startedAt}`
}

/**
 * Whether an idle agent transition closes the open task (extracted pure so
 * the decision is unit-testable). An idle with queued work is a TURN GAP —
 * the plan continues on the next wake, so the task stays open; a blocked
 * turn is waiting on the user and resumes when they answer. Only an idle
 * with no pending work and no user wait finalizes the task into history.
 */
export function shouldFinalizeTask(fold: CapsuleFoldState | undefined, hasPending: boolean): boolean {
  if (fold === undefined) return false
  if (hasPending) return false
  if (fold.capsule.lastTurnEndReason === 'blocked') return false
  return true
}

/**
 * P0-2: the retry link for a freshly finished entry — the latest archived
 * non-success entry of the SAME session, when there is one (best-effort:
 * the ring may already have evicted the original failure).
 */
export function retryLinkFor(entries: readonly HistoryEntry[], entry: { sessionId: string }): string | undefined {
  const prior = entries.find(candidate =>
    candidate.sessionId === entry.sessionId && candidate.status !== 'success')
  return prior !== undefined ? entryId(prior) : undefined
}

/**
 * P0-1: fold subagent child capsules into one parent summary (pure, so the
 * aggregation is unit-testable without a live cordis context).
 */
export function aggregateChildren(
  children: ReadonlyArray<{ sessionId: string; capsule: CapsuleState }>,
): ParentSummary {
  const out: ChildSummary[] = []
  const totals = { done: 0, active: 0, pending: 0, files: 0, additions: 0, deletions: 0 }
  for (const child of children) {
    const { todos, files } = child.capsule
    let done = 0
    let active = 0
    for (const todo of todos) {
      if (todo.status === 'completed') done += 1
      else if (todo.status === 'in_progress') active += 1
    }
    out.push({
      sessionId: child.sessionId,
      done,
      active,
      pending: todos.length - done - active,
      files: files.paths.length,
      additions: files.additions,
      deletions: files.deletions,
    })
    totals.done += done
    totals.active += active
    totals.pending += todos.length - done - active
    totals.files += files.paths.length
    totals.additions += files.additions
    totals.deletions += files.deletions
  }
  return { children: out, totals }
}

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
    const error = entry.error
    if (error !== undefined && typeof error !== 'string') continue
    const frames = entry.frames
    if (frames !== undefined && (typeof frames !== 'number' || !Number.isFinite(frames))) continue
    const retriedFrom = entry.retriedFrom
    if (retriedFrom !== undefined && typeof retriedFrom !== 'string') continue
    out.push({
      sessionId: entry.sessionId,
      status: status as HistoryStatus,
      startedAt,
      finishedAt,
      durationMs,
      completedTodos,
      totalTodos,
      files,
      ...(error !== undefined ? { error } : {}),
      ...(frames !== undefined ? { frames } : {}),
      ...(retriedFrom !== undefined ? { retriedFrom } : {}),
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
  /** Parent session → its subagent child session ids (P0-1). */
  private readonly childrenByParent = new Map<string, Set<string>>()
  /** Session → taskCapsule frames observed since the last direct prompt (P0-3). */
  private readonly frames = new Map<string, number>()

  constructor(ctx: Context, private readonly settings: SettingsService) {
    super(ctx, 'taskCapsuleHistory')
    // Fold the session log into each session's capsule, register subagent
    // children under their parent, and reset frame counts on task starts.
    this.ctx.on('session/event', (session, event) => {
      this.folds.observe(session.id, event)
      const header = session.header
      const depth = header.delegationDepth ?? 0
      const parent = header.parentSession
      if (depth > 0 && parent !== undefined) {
        let children = this.childrenByParent.get(parent)
        if (children === undefined) {
          children = new Set()
          this.childrenByParent.set(parent, children)
        }
        children.add(session.id)
      }
      if (isDirectPrompt(event)) {
        this.frames.set(session.id, 0)
      }
    })
    // Frame telemetry (P0-3): count taskCapsule projection updates per
    // session. The seam may be absent (headless) — guard and dispose.
    const projections = this.ctx.get('sessionProjections') as
      | { onChanged(listener: (session: { id: string }, key: string) => void): () => void }
      | undefined
    if (projections !== undefined) {
      this.ctx.effect(() => projections.onChanged((session, key) => {
        if (key !== 'taskCapsule') return
        this.frames.set(session.id, (this.frames.get(session.id) ?? 0) + 1)
      }), 'task-capsule: frame telemetry')
    }
    // The lifecycle drives task boundaries: a running → idle transition
    // closes the open task (a later direct prompt opens the next one).
    // Subagent children fold no entry of their own — the ring lists
    // user-facing tasks — but their folds are KEPT so the parent's
    // aggregation can read the current delegated work.
    this.ctx.on('agent/status', ({ agent, status }) => {
      const sessionId = agent.session.id
      const subagent = (agent.session.header.delegationDepth ?? 0) > 0
      if (status === 'running' && !subagent) {
        this.open.add(sessionId)
      } else if (status === 'idle' && this.open.has(sessionId)) {
        // A turn gap (more queued work) or a blocked turn (waiting on the
        // user) is NOT a task end — keep the task open so the ring records
        // one entry per task, not one per turn.
        const fold = this.folds.current(sessionId)
        if (!shouldFinalizeTask(fold, agent.inbox.hasPending)) return
        this.open.delete(sessionId)
        if (fold !== undefined) {
          const entry = finalize(sessionId, fold, Date.now(), { frames: this.frames.get(sessionId) })
          this.push(entry)
          // Frames are per-task telemetry; the archived value is captured.
          this.frames.delete(sessionId)
        }
      }
    })
    // A disposed session must release its fold, frame count, open-task slot
    // and any subagent-parent registration — otherwise long-running hosts
    // accumulate one stale entry per departed session.
    this.ctx.on('session/disposed', session => {
      const sessionId = session.id
      this.folds.drop(sessionId)
      this.frames.delete(sessionId)
      this.open.delete(sessionId)
      for (const [parent, children] of this.childrenByParent) {
        if (children.delete(sessionId) && children.size === 0) this.childrenByParent.delete(parent)
      }
      this.childrenByParent.delete(sessionId)
    })
    // Restore the persisted ring (best-effort; the default stands on error).
    void this.load()
  }

  /** Finished tasks, newest first, capped by the current settings limit. */
  list(): HistoryEntry[] {
    const cap = this.settings.get().historyLimit
    if (this.entries.length > cap) {
      this.entries.length = cap
      // The limit shrank since the last write — bring the persisted file in
      // line too (lazy: only when a read actually trims).
      void this.persist()
    }
    return this.entries
  }

  /**
   * Aggregated current-task facts of every subagent child (P0-1). Children
   * with no fold yet (never observed) are omitted; an empty `children`
   * array means the session has no subagents.
   */
  parentSummary(parentSessionId: string): ParentSummary {
    const children: Array<{ sessionId: string; capsule: CapsuleState }> = []
    for (const childId of this.childrenByParent.get(parentSessionId) ?? []) {
      const capsule = this.folds.current(childId)?.capsule
      if (capsule === undefined) continue
      children.push({ sessionId: childId, capsule })
    }
    return aggregateChildren(children)
  }

  private push(entry: HistoryEntry): void {
    // P0-2: a new entry for a session whose latest archived attempt failed
    // is a retry — link it back so the list can show the chain.
    if (entry.retriedFrom === undefined) {
      const link = retryLinkFor(this.entries, entry)
      if (link !== undefined) entry.retriedFrom = link
    }
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
export function finalize(
  sessionId: string,
  fold: CapsuleFoldState,
  finishedAt: number,
  extras: { frames?: number } = {},
): HistoryEntry {
  const capsule = fold.capsule
  const startedAt = capsule.startedAt ?? finishedAt
  const totalTodos = capsule.todos.length
  const completedTodos = capsule.todos.filter(todo => todo.status === 'completed').length
  const reason = capsule.lastTurnEndReason
  const status = historyStatusOf(reason ?? 'completed')
  // Carry the turn/end reason as the failure detail when the task did not
  // end cleanly (the recent list surfaces it; a clean task carries none).
  const error = status === 'success' ? undefined : (reason ?? undefined)
  return {
    sessionId,
    status,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    completedTodos,
    totalTodos,
    files: capsule.files,
    ...(error !== undefined ? { error } : {}),
    ...(extras.frames !== undefined ? { frames: extras.frames } : {}),
  }
}
