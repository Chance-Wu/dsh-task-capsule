/**
 * The expanded task list (phase 2 §10): one row per plan item with a status
 * mark and the observed duration. Visual hierarchy is strict — the current
 * task carries the most weight, completed items recede, pending items are
 * faintest — so the eye lands on "what is happening now". The current
 * operation line hangs under the running item (the file being edited or the
 * command being executed, from the live snapshot's running calls).
 * @module dsh-task-capsule/client/TaskTree
 */

import type { RunningToolCall } from '@deepseek-ai/dsh-client-runtime/client'
import type { TaskItem } from '../types/capsule.ts'
import { describeCall, durationLabel, formatDuration } from './format.ts'
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

/** Props for the task tree: the plan plus the live snapshot's running calls. */
export interface TaskTreeProps {
  items: readonly TaskItem[]
  /** Clock for live durations (the chip ticks it while visible). */
  now: number
  runningCalls: readonly RunningToolCall[]
  showDuration: boolean
  showCurrentOp: boolean
}

export function TaskTree({ items, now, runningCalls, showDuration, showCurrentOp }: TaskTreeProps) {
  if (items.length === 0) return null
  const active = items.find(item => item.status === 'in_progress')
  const op = showCurrentOp && runningCalls.length > 0 ? runningCalls[runningCalls.length - 1]! : undefined

  return (
    <ul className={css.tree}>
      {items.map(item => {
        const glyph = item.status === 'completed'
          ? <DoneGlyph />
          : item.status === 'in_progress' ? <ActiveGlyph /> : <PendingGlyph />
        const duration = itemDuration(item, now, showDuration)
        return (
          <li key={item.content} className={css.treeItem} data-status={item.status}>
            {glyph}
            <span className={css.treeContent} title={item.content}>{item.content}</span>
            {duration !== '' ? <span className={css.treeDuration}>{duration}</span> : null}
            {item === active && op !== undefined ? (
              <span className={css.currentOp}>
                <span className={css.currentOpLabel} aria-hidden>▸</span>
                <span className={css.currentOpText} title={describeCall(op)}>{describeCall(op)}</span>
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
