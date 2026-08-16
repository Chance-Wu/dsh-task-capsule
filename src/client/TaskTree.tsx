/**
 * The expanded task list (phase 2 §10): one row per plan item with a status
 * mark and the observed duration. Visual hierarchy is strict — the current
 * task carries the most weight, completed items recede, pending items are
 * faintest — so the eye lands on "what is happening now". The current
 * operation line hangs under the running item (the file being edited or the
 * command being executed, from the live snapshot's running calls).
 *
 * P1 iterations: the active item flashes on switch (P1-7); completed items
 * group under a collapsed toggle so long plans stay focused on the open work
 * (P1-8); each item shows a thin duration bar relative to the longest item
 * (P1-9).
 * @module dsh-task-capsule/client/TaskTree
 */

import { useEffect, useRef, useState } from 'react'
import type { RunningToolCall } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaskItem } from '../types/capsule.ts'
import { clipLong, describeCall, durationLabel, formatDuration } from './format.ts'
import { NS } from './locales.ts'
import css from './Capsule.module.css'

/** Completed: a static check — the state ends, no celebration. */
function DoneGlyph() {
  return (
    <span className={`${css.itemGlyph} ${css.itemGlyphDone}`} aria-hidden>
      <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
        <path d="M10 3.2L4.8 8.4C4.6 8.6 4.3 8.6 4.1 8.4L2 6.3L2.9 5.4L4.45 6.95L9.1 2.3L10 3.2Z" fill="currentColor" />
      </svg>
    </span>
  )
}

/** In progress: a breathing dot (same language as the capsule status). */
function ActiveGlyph() {
  return (
    <span className={`${css.itemGlyph} ${css.itemGlyphActive}`} aria-hidden>
      <span className={css.glyphDot} />
    </span>
  )
}

/** Pending: a hollow unstarted ring. */
function PendingGlyph() {
  return (
    <span className={`${css.itemGlyph} ${css.itemGlyphPending}`} aria-hidden>
      <span className={css.glyphRing} />
    </span>
  )
}

/** The duration shown for one item, or `—` when it has not started. */
function itemDuration(item: TaskItem, now: number, show: boolean): string {
  if (!show) return ''
  if (item.status === 'completed' && item.completedAt !== undefined) {
    return formatDuration(item.completedAt - (item.startedAt ?? item.completedAt))
  }
  if (item.status === 'in_progress') {
    return durationLabel(item.startedAt, now)
  }
  return '—'
}

/** P1-9: the item's observed duration in ms (0 when unstarted). */
function itemElapsedMs(item: TaskItem, now: number): number {
  if (item.status === 'completed' && item.completedAt !== undefined) {
    return Math.max(0, item.completedAt - (item.startedAt ?? item.completedAt))
  }
  if (item.status === 'in_progress') {
    return item.startedAt === undefined ? 0 : Math.max(0, now - item.startedAt)
  }
  return 0
}

/**
 * The live-operation line: `▸ tool command-or-file`. Shared by the task tree
 * (under the active item) and the plan-less panel (under the current-task
 * row), so `showCurrentOp` works without a todo plan too.
 */
export function CurrentOpLine({ op }: { op: RunningToolCall }) {
  return (
    <span className={css.currentOp}>
      <span className={css.currentOpLabel} aria-hidden>▸</span>
      <span className={css.currentOpTool} aria-hidden>{op.name}</span>
      <span className={css.currentOpText} title={describeCall(op)}>{clipLong(describeCall(op), 64)}</span>
    </span>
  )
}

/** Props for the task tree: the plan plus the live snapshot's running calls. */
export interface TaskTreeProps {
  items: readonly TaskItem[]
  /** Clock for live durations (the chip ticks it while visible). */
  now: number
  runningCalls: readonly RunningToolCall[]
  showDuration: boolean
  showCurrentOp: boolean
  t: TranslateNS<typeof NS>
}

export function TaskTree({ items, now, runningCalls, showDuration, showCurrentOp, t }: TaskTreeProps) {
  if (items.length === 0) return null
  const active = items.find(item => item.status === 'in_progress')
  const op = showCurrentOp && runningCalls.length > 0 ? runningCalls[runningCalls.length - 1]! : undefined

  // P1-9: the duration bars share the longest observed item as their 100%.
  const maxElapsed = Math.max(1, ...items.map(item => itemElapsedMs(item, now)))

  // P1-8: completed items default to a collapsed group; the toggle keeps the
  // plan focused on open work.
  const [completedOpen, setCompletedOpen] = useState(false)
  const pendingAndActive = items.filter(item => item.status !== 'completed')
  const completed = items.filter(item => item.status === 'completed')

  // P1-7: flash the row whose item becomes active (a fresh task switch).
  const [flashId, setFlashId] = useState<string | null>(null)
  const prevActiveRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const content = active?.content
    if (content !== undefined && content !== prevActiveRef.current) {
      setFlashId(content)
      const timer = window.setTimeout(() => setFlashId(null), 700)
      prevActiveRef.current = content
      return () => window.clearTimeout(timer)
    }
    prevActiveRef.current = content
  }, [active?.content])

  const renderItem = (item: TaskItem): JSX.Element => {
    const glyph = item.status === 'completed'
      ? <DoneGlyph />
      : item.status === 'in_progress' ? <ActiveGlyph /> : <PendingGlyph />
    const duration = itemDuration(item, now, showDuration)
    const elapsed = itemElapsedMs(item, now)
    return (
      <li
        key={item.content}
        className={`${css.treeItem}${item.content === flashId ? ` ${css.treeItemFlash}` : ''}`}
        data-status={item.status}
      >
        {glyph}
        <span className={css.treeContent} title={item.content}>{item.content}</span>
        {duration !== '' ? <span className={css.treeDuration}>{duration}</span> : null}
        {showDuration && elapsed > 0
          ? (
            <span className={css.treeBar} aria-hidden>
              <span className={css.treeBarFill} style={{ width: `${Math.round((elapsed / maxElapsed) * 100)}%` }} />
            </span>
          )
          : null}
        {item === active && op !== undefined ? <CurrentOpLine op={op} /> : null}
      </li>
    )
  }

  return (
    <ul className={css.tree}>
      {pendingAndActive.map(renderItem)}
      {completed.length > 0 ? (
        <li className={css.treeGroup}>
          <button
            type="button"
            className={css.treeGroupToggle}
            aria-expanded={completedOpen}
            onClick={() => setCompletedOpen(current => !current)}
          >
            <span className={`${css.treeArrow}${completedOpen ? ` ${css.treeArrowOpen}` : ''}`} aria-hidden>▸</span>
            <span className={css.treeGroupLabel}>{t('tree.completed', { count: completed.length })}</span>
          </button>
          {completedOpen ? completed.map(renderItem) : null}
        </li>
      ) : null}
    </ul>
  )
}
