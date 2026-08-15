/**
 * The expanded capsule panel (phase 2 §2, §12): a compact, minimal surface —
 * header with a close button, the status line, the current task with its
 * elapsed time, the task list (current > completed > pending), and a
 * restrained failure entry. No progress bar, no file statistics, no recent
 * tasks, no dashboard: everything management-shaped stays out.
 * @module dsh-task-capsule/client/CapsulePanel
 */

import { useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CapsuleAccent, CapsuleSettings, CapsuleState, CapsuleStatus } from '../types/capsule.ts'
import { NS, STATUS_KEYS } from './locales.ts'
import { durationLabel, formatDuration } from './format.ts'
import { waitingReason } from './status.ts'
import { StatusGlyph } from './StatusGlyph.tsx'
import { TaskTree } from './TaskTree.tsx'
import { HistoryList } from './HistoryList.tsx'
import css from './Capsule.module.css'

/** Elapsed time: frozen at the last activity once the task is over. */
function elapsed(capsule: CapsuleState | undefined, status: CapsuleStatus, now: number): number {
  if (capsule?.startedAt === undefined) return 0
  const end = status === 'running' || status === 'waiting' || status === 'pending' ? now : (capsule.lastActivityAt ?? now)
  return Math.max(0, end - capsule.startedAt)
}

/** Whether the status is a finished one (the chip carries the summary). */
function isTerminal(status: CapsuleStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'paused'
}

export interface CapsulePanelProps {
  snap: ConversationSnapshot
  capsule: CapsuleState | undefined
  status: CapsuleStatus
  now: number
  settings: CapsuleSettings | null
  /** The framework goal projection (composed deployments only). */
  goal?: { goal?: { objective?: string; phase?: string } } | undefined
  /** Accent selection for the running dot / progress fill. */
  accent?: CapsuleAccent
  /** Resolve a session's display title; falls back to the session id. */
  titleOf: (sessionId: string) => string
  /** Close the panel (the × button). */
  onClose: () => void
  t: TranslateNS<typeof NS>
}

export function CapsulePanel({ snap, capsule, status, now, settings, goal, accent, titleOf, onClose, t }: CapsulePanelProps) {
  const [showError, setShowError] = useState(false)
  const todos = capsule?.todos ?? []
  const activeTodo = todos.find(item => item.status === 'in_progress')
  const failed = status === 'failed'
  const errorText = failed ? (snap.lastAgentError ?? capsule?.lastTurnEndReason ?? t('status.failed')) : null
  const reason = status === 'waiting' ? waitingReason(snap) : undefined

  const statusLine = reason !== undefined
    ? reason.kind === 'approval'
      ? reason.reason !== undefined
        ? t('waiting.approval.reason', { tool: reason.tool, reason: reason.reason })
        : t('waiting.approval', { tool: reason.tool })
      : t('waiting.question', { question: reason.text })
    : null

  const showCurrent = !isTerminal(status)
  // With a plan but no active item (everything done / the agent wrapping up),
  // the row reads "all done"; without a plan it falls back to the session
  // title. The live status is what carries the nuance either way.
  const currentName = showCurrent
    ? activeTodo?.content ?? (todos.length > 0 ? t('panel.allDone') : titleOf(snap.sessionId))
    : null
  const currentDuration = activeTodo !== undefined
    ? durationLabel(activeTodo.startedAt, now)
    : formatDuration(elapsed(capsule, status, now))

  // Thin done/total progress bar under the current task (P1).
  const doneCount = todos.filter(item => item.status === 'completed').length
  const progressPct = todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0
  const goalObjective = goal?.goal?.objective
  const panelClass = settings?.density === 'compact'
    ? `${css.panel} ${css.panelCompact}`
    : css.panel

  return (
    <div className={panelClass} data-accent={accent ?? 'auto'}>
      <div className={css.panelHeader}>
        <span className={css.panelTitle}>{t('panel.title')}</span>
        <button type="button" className={css.panelClose} aria-label={t('panel.close')} onClick={onClose}>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={css.statusLine}>
        <StatusGlyph status={status} />
        <span className={css.statusText}>{t(STATUS_KEYS[status])}</span>
        {statusLine !== null ? <span className={css.statusReason} title={statusLine}>{statusLine}</span> : null}
      </div>

      {goalObjective !== undefined ? (
        <div className={css.goalLine} title={goalObjective}>
          <span className={css.goalLabel}>{t('panel.goal')}</span>
          <span className={css.goalText}>{goalObjective}</span>
        </div>
      ) : null}

      {currentName !== null ? (
        <div className={css.currentTask}>
          <span className={css.currentTaskName} title={currentName}>{currentName}</span>
          <span className={css.currentTaskDuration}>{currentDuration}</span>
        </div>
      ) : null}

      {settings?.showProgress !== false && todos.length > 0 ? (
        <div className={css.progress} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${doneCount}/${todos.length}`}>
          <div className={css.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      ) : null}

      {capsule !== undefined && capsule.files.paths.length > 0 ? (
        <div className={css.filesLine} title={capsule.files.paths.join(' · ')}>
          {t('panel.files', {
            count: capsule.files.paths.length,
            additions: capsule.files.additions,
            deletions: capsule.files.deletions,
          })}
        </div>
      ) : null}

      <TaskTree
        items={todos}
        now={now}
        runningCalls={snap.runningCalls}
        showDuration={settings?.showDuration ?? true}
        showCurrentOp={settings?.showCurrentOp ?? true}
      />

      {failed && errorText !== null ? (
        <div className={css.errorBlock}>
          <div className={css.errorLine} title={errorText}>{errorText}</div>
          <button type="button" className={css.errorToggle} onClick={() => setShowError(current => !current)} aria-expanded={showError}>
            {t('panel.error.view')}
          </button>
          {showError ? <div className={css.errorDetail} data-testid="capsule-error-detail">{errorText}</div> : null}
        </div>
      ) : null}

      <HistoryList t={t} />
    </div>
  )
}
