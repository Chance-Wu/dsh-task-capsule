/**
 * Per-session fold store: keeps one task-capsule fold per session and feeds
 * it committed session events. The fold itself is a pure reducer (see
 * ../harness/adapter.ts); this class owns the session → fold map so the
 * history service can finalize a task when its agent goes idle.
 * @module dsh-task-capsule/task/task-manager
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { applyFold, initialFold, type CapsuleFoldState } from '../harness/adapter.ts'

export class TaskManager {
  private readonly bySession = new Map<string, CapsuleFoldState>()

  /** Apply one committed event to a session's fold (creating it on demand). */
  observe(sessionId: string, event: SessionEvent): CapsuleFoldState {
    const current = this.bySession.get(sessionId) ?? initialFold()
    const next = applyFold(current, event)
    this.bySession.set(sessionId, next)
    return next
  }

  /** The current fold for a session, absent before the first observed event. */
  current(sessionId: string): CapsuleFoldState | undefined {
    return this.bySession.get(sessionId)
  }

  /** Drop a session's fold (after its task was finalized). */
  drop(sessionId: string): void {
    this.bySession.delete(sessionId)
  }
}
