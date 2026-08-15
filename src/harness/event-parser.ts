/**
 * Event classification and narrowers for the task-capsule fold.
 *
 * Everything here is a pure function over committed session events — the
 * fold must stay replay-safe, so no live state may be read (and nothing is).
 * The fs tools' `tool/result` `meta` is opaque (`unknown`) by contract; the
 * narrowers here are deliberately defensive because the capsule treats it
 * as an enhancement, never a correctness input.
 * @module dsh-task-capsule/harness/event-parser
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { CapsuleFiles } from '../types/capsule.ts'

/** One hunk of the fs tools' result-time contextual diff (`meta.diffs`). */
export interface HunkDiff {
  path: string
  oldText: string | null
  newText: string | null
}

/**
 * Whether an event opens a new task: a direct human prompt. Synthetic
 * `user/message`s (plugin injections, goal rounds, cron notices) carry other
 * source kinds and must NOT reset the capsule mid-task.
 */
export function isDirectPrompt(event: SessionEvent): boolean {
  return event.type === 'user/message' && event.data.source.kind === 'user'
}

/**
 * Narrow the opaque fs result `meta` into per-hunk diffs. Returns
 * `undefined` when the meta is absent or malformed (a non-fs tool, a read,
 * or a future shape) so the fold can simply skip it.
 */
export function diffsFromMeta(meta: unknown): HunkDiff[] | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const raw = (meta as Record<string, unknown>).diffs
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: HunkDiff[] = []
  for (const diff of raw) {
    if (typeof diff !== 'object' || diff === null) return undefined
    const d = diff as Record<string, unknown>
    if (typeof d.path !== 'string') return undefined
    const oldText = typeof d.oldText === 'string' ? d.oldText : null
    const newText = typeof d.newText === 'string' ? d.newText : null
    if (oldText === null && newText === null) continue
    out.push({ path: d.path, oldText, newText })
  }
  return out.length > 0 ? out : undefined
}

/** Count the lines a side contributes (0 for an absent side). */
function sideLines(side: string | null): number {
  return side === null || side === '' ? 0 : side.split('\n').length
}

/**
 * Accumulate a hunk list into file statistics. The previous object is never
 * mutated: the fold must stay pure.
 */
export function addDiffs(files: CapsuleFiles, diffs: HunkDiff[]): CapsuleFiles {
  const seen = new Set(files.paths)
  const paths = [...files.paths]
  let additions = files.additions
  let deletions = files.deletions
  for (const diff of diffs) {
    if (!seen.has(diff.path)) {
      seen.add(diff.path)
      paths.push(diff.path)
    }
    additions += sideLines(diff.newText)
    deletions += sideLines(diff.oldText)
  }
  return { paths, additions, deletions }
}

/**
 * Defensive reader for the goal plugin's `goal/change` session event
 * (merged by `@deepseek-ai/dsh-goal`; composed deployments only). Absent
 * event type or phase returns `undefined` so the fold stays unchanged.
 */
export function goalPhaseOf(event: SessionEvent): 'active' | 'paused' | 'blocked' | 'complete' | undefined {
  if ((event as { type: string }).type !== 'goal/change') return undefined
  const data = (event as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const goal = (data as Record<string, unknown>).goal
  if (typeof goal !== 'object' || goal === null) return undefined
  const phase = (goal as Record<string, unknown>).phase
  if (phase === 'active' || phase === 'paused' || phase === 'blocked' || phase === 'complete') {
    return phase
  }
  return undefined
}
