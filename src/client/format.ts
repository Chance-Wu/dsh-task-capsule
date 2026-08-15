/**
 * Small shared formatting helpers for the browser half (phase 2: the
 * capsule is a status indicator, so time reads as a clock — `01:42`,
 * `01:12:42` past an hour — and a task that has not started shows `—`
 * rather than a misleading `00:00`).
 * @module dsh-task-capsule/client/format
 */

import type { RunningToolCall } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Shorten a long label to at most `max` characters by keeping BOTH ends:
 * `head…tail`. Task titles carry their actionable detail at the end (file
 * names, concrete outcomes), so a plain trailing ellipsis throws it away —
 * the chip uses this to show the head and the tail at a glance. A label at
 * or under the limit is returned unchanged.
 */
export function clipLong(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil(max * 0.6)
  const tail = max - head - 1
  return `${text.slice(0, head)}…${text.slice(-tail)}`
}

/**
 * Elapsed time as a clock: `MM:SS`, widening to `HH:MM:SS` past an hour.
 * Never shows `00:00` for an unstarted task — callers pass `startedAt`
 * absence through {@link durationLabel} instead.
 */
export function formatDuration(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

/**
 * The duration shown for a task: the clock when it has started, `—` when it
 * has not (a pending item must not look like it is already running).
 */
export function durationLabel(startedAt: number | undefined, now: number): string {
  return startedAt === undefined ? '—' : formatDuration(now - startedAt)
}

/**
 * One human line for a running tool call: the fs tools' `file_path`/`path`
 * argument (the file being edited) or the bash `command`, falling back to
 * the tool name when the arguments are not JSON or carry nothing readable.
 */
export function describeCall(call: RunningToolCall): string {
  try {
    const args = JSON.parse(call.argsRaw) as Record<string, unknown>
    const path = typeof args.file_path === 'string'
      ? args.file_path
      : typeof args.path === 'string' ? args.path : undefined
    if (path !== undefined) return path
    if (typeof args.command === 'string' && args.command !== '') return args.command
  } catch {
    // argsRaw is the model's raw arguments JSON; a parse failure falls back.
  }
  return call.name
}
