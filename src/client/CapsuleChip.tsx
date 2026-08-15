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

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { CapsuleAccent, CapsuleSettings, CapsuleState, CapsuleStatus } from '../types/capsule.ts'
import { apiOf } from './api.ts'
import { deriveStatus, isWaiting } from './status.ts'
import { clipLong, formatDuration, progressLabel, todoCounts } from './format.ts'
import { NS, STATUS_KEYS } from './locales.ts'
import { StatusGlyph } from './StatusGlyph.tsx'
import { CapsulePanel } from './CapsulePanel.tsx'
import css from './Capsule.module.css'

/** Accent → dsw semantic token; `auto` leaves the default in place. */
const ACCENT_VARS: Record<CapsuleAccent, string | undefined> = {
  auto: undefined,
  business: 'var(--dsw-alias-state-business-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
}

/** Full props for the header-utilities slot entry. */
export type CapsuleChipProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>

/** Default keep-after-done duration until the REST settings arrive. */
const DEFAULT_KEEP_MS = 8000

/** How long an open panel lingers after its task finishes before collapsing. */
const AUTO_COLLAPSE_MS = 1500

/** The panel's exit-animation length (must match .popoverClosing's transition). */
const CLOSE_ANIM_MS = 240

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
  // Exit-animation latch: the floating panel stays mounted (class toggled to
  // .popoverClosing) for CLOSE_ANIM_MS so the collapse reads as a morph
  // back into the chip instead of a hard unmount.
  const [closing, setClosing] = useState(false)
  // The floating panel's viewport anchor (under the chip, right-aligned).
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [doneAt, setDoneAt] = useState<number | null>(null)
  const wasRunning = useRef(false)
  const prevRunning = useRef(false)
  const prevStart = useRef<number | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Load the runtime settings once; the panel refreshes them on expand.
  useEffect(() => {
    let alive = true
    apiOf().settings()
      .then(value => { if (alive) setSettings(value) })
      .catch(() => { /* defaults stand */ })
    return () => { alive = false }
  }, [])

  // Completion latch: a running → idle transition with task activity freezes
  // the done time (a later direct prompt opens the next task). An idle
  // transition with more work still queued is a turn gap, not completion —
  // the latch only fires when the queue has drained.
  useEffect(() => {
    if (snap.running) {
      wasRunning.current = true
      return
    }
    if (wasRunning.current && (snap.queue?.length ?? 0) === 0) {
      wasRunning.current = false
      if (capsule !== undefined && capsule.startedAt !== undefined) setDoneAt(Date.now())
    }
  }, [snap.running, snap.queue, capsule])

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

  // Whether the plan is fully completed (or there is no plan): the state the
  // panel collapses back to the chip on.
  const allDone = (capsule?.todos.length ?? 0) === 0
    || (capsule?.todos.every(item => item.status === 'completed') ?? false)

  const status = deriveStatus(snap, capsule)
  // The framework's goal projection (composed deployments only): the panel
  // shows the active objective under the status row.
  const goal = useProjection('goal') as { goal?: { objective?: string; phase?: string } } | undefined
  const hasActivity = capsule !== undefined && (
    capsule.todos.length > 0 || capsule.startedAt !== undefined || capsule.files.paths.length > 0
  )
  const showingDone = doneAt !== null
  // `alwaysVisible` pins the capsule even for an idle session with no activity.
  const visible = settings?.alwaysVisible === true || snap.running || isWaiting(snap) || hasActivity || showingDone

  // Debug aid: count projection updates while traceFrames is on, so the
  // frame-churn guard's effect is observable in the console.
  const frameCount = useRef(0)
  useEffect(() => {
    if (settings?.traceFrames !== true) return
    frameCount.current += 1
    console.info(`[task-capsule] capsule frame #${frameCount.current}`)
  }, [capsule, settings?.traceFrames])

  // The clock runs while anything on screen moves (live durations).
  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [visible])

  // Close the popover when the control itself disappears.
  useEffect(() => {
    if (!visible && open) {
      setClosing(false)
      setOpen(false)
    }
  }, [visible, open])

  // Close with the exit animation: toggle the closing class, then unmount.
  const closePanel = (): void => {
    if (!open || closing) return
    setClosing(true)
    window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_ANIM_MS)
  }

  // Auto-expand while a task runs: the idle → running edge opens the panel
  // so the live plan is visible (a later manual close stays closed until the
  // next task starts). Auto-collapse happens when the task completes AND the
  // plan is fully done — back to the compact capsule state.
  useEffect(() => {
    const started = snap.running && !prevRunning.current
    prevRunning.current = snap.running
    if (started && settings?.autoExpandRunning !== false) {
      setClosing(false)
      setOpen(true)
    }
  }, [snap.running, settings?.autoExpandRunning])

  // Auto-collapse: when the open panel's task finishes (the same running →
  // idle latch that freezes the done time) AND every todo is completed (or
  // there is no plan), give the completion a moment to register, then morph
  // back into the compact chip. A failed/stalled plan stays open so the
  // error entry is visible. Keyed on the done latch itself, which fires
  // exactly once per task, rather than on the derived status (which can
  // flicker across turns within one task).
  const prevDone = useRef<number | null>(null)
  useEffect(() => {
    const wasDone = prevDone.current !== null
    prevDone.current = doneAt
    if (!open || wasDone) return
    if (doneAt !== null && allDone) {
      const timer = setTimeout(closePanel, AUTO_COLLAPSE_MS)
      return () => clearTimeout(timer)
    }
  }, [doneAt, open, allDone])

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

  // Anchor the floating panel under the chip (right-aligned), re-measured on
  // scroll/resize so it never detaches from the chip while open.
  useLayoutEffect(() => {
    if (!open && !closing) return
    const anchor = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const top = rect.bottom + 6
      const right = Math.max(8, window.innerWidth - rect.right)
      setPos({
        top,
        right,
        maxHeight: Math.max(120, window.innerHeight - top - 8),
      })
    }
    anchor()
    window.addEventListener('resize', anchor)
    document.addEventListener('scroll', anchor, true)
    return () => {
      window.removeEventListener('resize', anchor)
      document.removeEventListener('scroll', anchor, true)
    }
  }, [open, closing])

  // Click-outside closes; the panel is portaled to <body>, so both the chip
  // root and the floating panel count as "inside".
  useEffect(() => {
    if (!open && !closing) return
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && !rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        closePanel()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [open, closing])

  // ESC closes wherever focus is (the chip or the portaled panel).
  useEffect(() => {
    if (!open && !closing) return
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closePanel()
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open, closing])

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

  const accent = settings?.accent ?? 'auto'
  const accentVar = ACCENT_VARS[accent]
  const rootStyle: CSSProperties | undefined = accentVar !== undefined
    ? { ['--dsh-capsule-accent' as string]: accentVar }
    : undefined

  return (
    <div ref={rootRef} className={css.root} style={rootStyle}>
      <button
        ref={triggerRef}
        type="button"
        className={chipClass}
        aria-expanded={open}
        aria-label={chipFullText}
        title={chipFullText}
        onClick={() => {
          setNow(Date.now())
          if (open) {
            closePanel()
          } else {
            setClosing(false)
            setOpen(true)
          }
        }}
      >
        <StatusGlyph status={status} />
        <span className={css.chipLabel}>{labelText}</span>
        <span className={css.chipTime} aria-hidden>{durationText}</span>
      </button>
      {open || closing
        ? pos !== null
          ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={t('panel.title')}
              className={open ? css.popover : css.popoverClosing}
              style={{ top: pos.top, right: pos.right, maxHeight: pos.maxHeight }}
            >
              <div className={css.liquidFloat}>
                <CapsulePanel
                  snap={snap}
                  capsule={capsule}
                  status={status}
                  now={now}
                  settings={settings}
                  goal={goal}
                  accent={accent}
                  titleOf={titleOf}
                  onClose={closePanel}
                  t={t}
                />
              </div>
            </div>,
            document.body,
          )
          : null
        : null}
    </div>
  )
}
