/**
 * The expanded capsule panel (phase 2 §2, §12, lifted phase-3 surfaces): a
 * compact surface — header with a close button, the status line with its
 * waiting reason, the current task with its elapsed time, a thin progress
 * bar, the file-change summary, the subagent aggregate, the task list
 * (current > completed > pending), a restrained failure entry, and the
 * recent-task list. Everything stays read-only status: no log viewer, no
 * dashboard.
 * @module dsh-task-capsule/client/CapsulePanel
 */

import { useEffect, useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CapsuleSettings, CapsuleState, CapsuleStatus, ParentSummary } from '../types/capsule.ts'
import { apiOf, promptSession } from './api.ts'
import { NS, STATUS_KEYS } from './locales.ts'
import { durationLabel, formatDuration } from './format.ts'
import { isTerminal, waitingReason } from './status.ts'
import { StatusGlyph } from './StatusGlyph.tsx'
import { CurrentOpLine, TaskTree } from './TaskTree.tsx'
import { HistoryList } from './HistoryList.tsx'
import { openSession } from './session-nav.ts'
import css from './Capsule.module.css'

/** Elapsed time: frozen at the last activity once the task is over. */
function elapsed(capsule: CapsuleState | undefined, status: CapsuleStatus, now: number): number {
  if (capsule?.startedAt === undefined) return 0
  const end = status === 'running' || status === 'waiting' || status === 'pending' ? now : (capsule.lastActivityAt ?? now)
  return Math.max(0, end - capsule.startedAt)
}

/** The panel's subagent-poll cadence (only while children exist). */
const SUBAGENT_REFRESH_MS = 5_000

export interface CapsulePanelProps {
  snap: ConversationSnapshot
  capsule: CapsuleState | undefined
  status: CapsuleStatus
  now: number
  settings: CapsuleSettings | null
  /** The framework goal projection (composed deployments only). */
  goal?: { goal?: { objective?: string; phase?: string } } | undefined
  /** Resolve a session's display title; falls back to the session id. */
  titleOf: (sessionId: string) => string
  /** Close the panel (the × button). */
  onClose: () => void
  t: TranslateNS<typeof NS>
}

export function CapsulePanel({ snap, capsule, status, now, settings, goal, titleOf, onClose, t }: CapsulePanelProps) {
  const [showError, setShowError] = useState(false)
  const [retrying, setRetrying] = useState(false)
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

  // The live operation (last running call). With a plan it hangs under the
  // active item in the task tree; without a plan the panel shows it under
  // the current-task row so plan-less runs still say what the agent is doing.
  const op = settings?.showCurrentOp !== false && snap.runningCalls.length > 0
    ? snap.runningCalls[snap.runningCalls.length - 1]!
    : undefined

  // Thin done/total progress bar under the current task (P1).
  const doneCount = todos.filter(item => item.status === 'completed').length
  const progressPct = todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0
  const goalObjective = goal?.goal?.objective
  const panelClass = settings?.density === 'compact'
    ? `${css.panel} ${css.panelCompact}`
    : css.panel

  // Retry the failed task: open its session and queue a continuation prompt
  // (same affordance as the recent-task list).
  const retry = (): void => {
    openSession(snap.sessionId)
    setRetrying(true)
    promptSession(snap.sessionId, t('panel.retryPrompt')).finally(() => setRetrying(false))
  }

  return (
    <div className={panelClass}>
      <div className={css.panelHeader}>
        <span className={css.panelTitle}>{t('panel.title')}</span>
        <button type="button" className={css.panelClose} aria-label={t('panel.close')} onClick={onClose}>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={css.statusLine} data-status={status}>
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
        <div
          className={css.currentTask}
          data-done={todos.length > 0 && doneCount === todos.length ? 'true' : 'false'}
        >
          <span className={css.currentTaskName} title={currentName}>{currentName}</span>
          <span className={css.currentTaskDuration}>{currentDuration}</span>
        </div>
      ) : null}
      {op !== undefined && todos.length === 0 ? <CurrentOpLine op={op} /> : null}

      {settings?.showProgress !== false && todos.length > 0 ? (
        <div
          className={css.progress}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${doneCount}/${todos.length}`}
          data-complete={doneCount === todos.length ? 'true' : 'false'}
        >
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

      <SubagentSummary sessionId={snap.sessionId} titleOf={titleOf} t={t} />

      <TaskTree
        items={todos}
        now={now}
        runningCalls={snap.runningCalls}
        showDuration={settings?.showDuration ?? true}
        showCurrentOp={settings?.showCurrentOp ?? true}
        t={t}
      />

      {failed && errorText !== null ? (
        <div className={css.errorBlock}>
          <div className={css.errorLine} title={errorText}>{errorText}</div>
          <div className={css.errorActions}>
            <button type="button" className={css.errorToggle} onClick={() => setShowError(current => !current)} aria-expanded={showError}>
              {t('panel.error.view')}
            </button>
            <button
              type="button"
              className={css.errorRetry}
              disabled={retrying}
              onClick={retry}
            >
              {t('panel.retry')}
            </button>
          </div>
          {showError ? <div className={css.errorDetail} data-testid="capsule-error-detail">{errorText}</div> : null}
        </div>
      ) : null}

      <HistoryList t={t} />
    </div>
  )
}

/**
 * P0-1: the parent session's subagent work, aggregated host-side and read
 * over REST. While the session has children the summary refreshes on a low
 * cadence (subagent progress advances independently of the parent's own
 * activity); with no children it is fetched once and hidden. The toggle
 * expands the per-child breakdown.
 */
function SubagentSummary({ sessionId, titleOf, t }: {
  sessionId: string
  titleOf: (sessionId: string) => string
  t: TranslateNS<typeof NS>
}): JSX.Element | null {
  const [summary, setSummary] = useState<ParentSummary | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    const load = (): void => {
      apiOf().parent(sessionId)
        .then(value => {
          if (!alive) return
          setSummary(value)
          // Keep the summary fresh only while children exist; a session with
          // no subagents needs no polling at all.
          const hasChildren = value.children.length > 0
          if (hasChildren && timer === undefined) {
            timer = window.setInterval(load, SUBAGENT_REFRESH_MS)
          } else if (!hasChildren && timer !== undefined) {
            window.clearInterval(timer)
            timer = undefined
          }
        })
        .catch(() => { /* no subagents / resource missing: stay hidden */ })
    }
    load()
    return () => {
      alive = false
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [sessionId])

  if (summary === null || summary.children.length === 0) return null
  const totals = summary.totals
  return (
    <div className={css.subagents}>
      <button
        type="button"
        className={css.subagentToggle}
        aria-expanded={expanded}
        onClick={() => setExpanded(current => !current)}
      >
        <span className={`${css.treeArrow}${expanded ? ` ${css.treeArrowOpen}` : ''}`} aria-hidden>▸</span>
        <span>
          {t('panel.subagents', {
            count: summary.children.length,
            done: totals.done,
            active: totals.active,
            pending: totals.pending,
            files: totals.files,
          })}
        </span>
      </button>
      {expanded ? (
        <ul className={css.subagentList}>
          {summary.children.map(child => {
            const total = child.done + child.active + child.pending
            return (
              <li key={child.sessionId} className={css.subagentItem}>
                <span className={css.subagentName} title={titleOf(child.sessionId)}>{titleOf(child.sessionId)}</span>
                <span className={css.subagentCounts}>
                  {t('panel.subagentRow', { done: child.done, total, files: child.files })}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
