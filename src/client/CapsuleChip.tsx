/**
 * The session-header capsule (phase 2 §1, §6): one compact status pill —
 * `● 任务 已完成3 进行中1 待处理5 · 02:18` — expanding into the task panel.
 * The default surface carries the status point, the plan's per-status
 * counts (completed / in progress / pending), and the clock; the elapsed
 * time reads as a muted clock, set off from the status text by a middle
 * dot so the two never run together. Sessions without a todo plan show
 * the fixed `会话任务处理` label. A finished task shows the status word
 * with its frozen duration (`✓ Task completed · 02:31`) and the panel
 * auto-collapses shortly after completion — the capsule is a status
 * indicator, not a task browser.
 *
 * The chip is a pure reader: everything it shows comes from the framework
 * session kit (`useSession`, `useProjection`) plus the settings resource.
 * @module dsh-task-capsule/client/CapsuleChip
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { CapsuleSettings, CapsuleState, CapsuleStatus } from '../types/capsule.ts'
import { apiOf } from './api.ts'
import { deriveStatus, isWaiting } from './status.ts'
import { clipLong, formatDuration, progressLabel, todoCounts } from './format.ts'
import { NS, STATUS_KEYS } from './locales.ts'
import { StatusGlyph } from './StatusGlyph.tsx'
import { CapsulePanel } from './CapsulePanel.tsx'
import css from './Capsule.module.css'

/** Full props for the header-utilities slot entry. */
export type CapsuleChipProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>

/** Default keep-after-done duration until the REST settings arrive. */
const DEFAULT_KEEP_MS = 8000

/** How long an open panel lingers after its task finishes before collapsing. */
const AUTO_COLLAPSE_MS = 1500

/** Max characters of the task name shown in the compact chip (both ends kept). */
const CHIP_NAME_MAX = 20

/** Finished statuses: the chip shows the status word + frozen duration. */
function isTerminal(status: CapsuleStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'paused'
}

export function CapsuleChip({ sessionId, useSession, useProjection, useSessions, t }: CapsuleChipProps) {
  const snap = useSession(state => state)
  const capsule = useProjection('taskCapsule')
  const byId = useSessions(state => state.byId)
  const [settings, setSettings] = useState<CapsuleSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [doneAt, setDoneAt] = useState<number | null>(null)
  const wasRunning = useRef(false)
  const prevStart = useRef<number | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Load the runtime settings once; the panel refreshes them on expand.
  useEffect(() => {
    let alive = true
    apiOf().settings()
      .then(value => { if (alive) setSettings(value) })
      .catch(() => { /* defaults stand */ })
    return () => { alive = false }
  }, [])

  // Completion latch: a running → idle transition with task activity freezes
  // the done time (a later direct prompt opens the next task).
  useEffect(() => {
    if (snap.running) {
      wasRunning.current = true
      return
    }
    if (wasRunning.current) {
      wasRunning.current = false
      if (capsule !== undefined && capsule.startedAt !== undefined) setDoneAt(Date.now())
    }
  }, [snap.running, capsule])

  // A new task (a fresh direct prompt) resets the capsule's start; clear the
  // previous task's completion latch so the done styling never leaks into
  // the next run.
  useEffect(() => {
    const start = capsule?.startedAt
    if (start !== undefined && prevStart.current !== undefined && start !== prevStart.current) {
      setDoneAt(null)
    }
    prevStart.current = start
  }, [capsule])

  const status = deriveStatus(snap, capsule)
  const hasActivity = capsule !== undefined && (
    capsule.todos.length > 0 || capsule.startedAt !== undefined || capsule.files.paths.length > 0
  )
  const showingDone = doneAt !== null
  // `alwaysVisible` pins the capsule even for an idle session with no activity.
  const visible = settings?.alwaysVisible === true || snap.running || isWaiting(snap) || hasActivity || showingDone

  // The clock runs while anything on screen moves (live durations).
  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [visible])

  // Close the popover when the control itself disappears.
  useEffect(() => {
    if (!visible && open) setOpen(false)
  }, [visible, open])

  // Auto-collapse: when the open panel's task finishes (the same running →
  // idle latch that freezes the done time), give the completion a moment to
  // register, then collapse — the capsule stays as the compact done chip
  // (phase 2 §11). Keyed on the done latch itself, which fires exactly once
  // per task, rather than on the derived status (which can flicker across
  // turns within one task).
  const prevDone = useRef<number | null>(null)
  useEffect(() => {
    const wasDone = prevDone.current !== null
    prevDone.current = doneAt
    if (!open || wasDone) return
    if (doneAt !== null) {
      const timer = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS)
      return () => clearTimeout(timer)
    }
  }, [doneAt, open])

  // Auto-expand a failed task when the setting asks for it.
  const autoExpanded = useRef(false)
  useEffect(() => {
    if (status === 'failed' && settings?.autoExpandFailed && !autoExpanded.current) {
      autoExpanded.current = true
      setOpen(true)
    }
    if (status !== 'failed') autoExpanded.current = false
  }, [status, settings])

  // Refresh settings when the panel opens so a config change lands.
  useEffect(() => {
    if (!open) return
    let alive = true
    apiOf().settings()
      .then(value => { if (alive) setSettings(value) })
      .catch(() => { /* keep the current copy */ })
    return () => { alive = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  if (!visible) return null

  const titleOf = (id: string): string => byId[id as SessionId]?.displayTitle ?? id
  const terminal = isTerminal(status)
  const live = !terminal
  const start = capsule?.startedAt
  const elapsedMs = live
    ? Math.max(0, now - (start ?? now))
    : Math.max(0, (capsule?.lastActivityAt ?? now) - (start ?? now))
  const durationText = start === undefined ? '—' : formatDuration(elapsedMs)

  // Status → task counts → time. The visible chip splits the front text
  // (status word / per-status counts / fixed plan-less label) from the
  // clock, so the elapsed time reads as its own muted element: `任务 已完成3
  // 进行中1 待处理5 · 02:18`. Terminal states keep the plan's done/total
  // progress with the status word (`✓ 任务完成 5/5 · 02:31`) and drop the
  // rest of the counts; sessions without a todo plan carry the fixed
  // `会话任务处理` label (clipped both-ends for safety, a no-op on the short
  // label). The full text rides the button's title/aria for hover and
  // screen readers.
  const todos = capsule?.todos ?? []
  const counts = todoCounts(todos)
  const hasPlan = todos.length > 0
  const countsText = t('chip.counts', counts)
  const doneSummary = hasPlan ? progressLabel(counts.done, todos.length) : ''
  const labelText = terminal
    ? hasPlan
      ? `${t(STATUS_KEYS[status])} ${doneSummary}`
      : t(STATUS_KEYS[status])
    : hasPlan
      ? countsText
      : clipLong(t('chip.sessionTask'), CHIP_NAME_MAX)
  const fullLabel = terminal
    ? hasPlan
      ? `${t(STATUS_KEYS[status])} ${doneSummary}`
      : t(STATUS_KEYS[status])
    : hasPlan
      ? countsText
      : t('chip.sessionTask')
  const chipFullText = `${fullLabel} ${durationText}`

  const chipClass = terminal ? `${css.chip} ${css.chipDone}` : css.chip

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={chipClass}
        aria-expanded={open}
        aria-label={chipFullText}
        title={chipFullText}
        onClick={() => { setNow(Date.now()); setOpen(current => !current) }}
      >
        <StatusGlyph status={status} />
        <span className={css.chipLabel}>{labelText}</span>
        <span className={css.chipTime} aria-hidden>{durationText}</span>
      </button>
      {open
        ? (
          <div className={css.popover}>
            <CapsulePanel
              snap={snap}
              capsule={capsule}
              status={status}
              now={now}
              settings={settings}
              titleOf={titleOf}
              onClose={() => setOpen(false)}
              t={t}
            />
          </div>
        )
        : null}
    </div>
  )
}
