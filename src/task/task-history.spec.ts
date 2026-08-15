/**
 * Pure-part tests for the history and settings services: entry finalization
 * and settings sanitization (the ring itself is a thin unshift+cap over the
 * settings limit and is exercised through the service in integration).
 * @module dsh-task-capsule/task/task-history.spec
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { applyFold, initialFold } from '../harness/adapter.ts'
import { aggregateChildren, finalize, retryLinkFor, sanitizeHistory } from './task-history.ts'
import { sanitizeSettings } from './task-state.ts'
import type { CapsuleState } from '../types/capsule.ts'

let seq = 0

/** Build a committed session event, casting the minimal data to the union. */
function ev(type: string, time: number, data: unknown): SessionEvent {
  seq += 1
  return { type, seq, time, data } as unknown as SessionEvent
}

function directPrompt(time: number): SessionEvent {
  return ev('user/message', time, { id: `m${time}`, role: 'user', content: [], source: { kind: 'user' } })
}

function todoWrite(time: number, todos: { content: string; status: 'pending' | 'in_progress' | 'completed' }[]): SessionEvent {
  return ev('todo/write', time, { todos })
}

function toolResult(time: number, meta: unknown): SessionEvent {
  return ev('tool/result', time, { turn: 1, step: 1, message: {}, meta })
}

function turnEnd(time: number, kind: string): SessionEvent {
  return ev('turn/end', time, { turn: 1, reason: { kind } })
}

describe('finalize', () => {
  it('projects the fold into a history entry', () => {
    let fold = initialFold()
    fold = applyFold(fold, directPrompt(100))
    fold = applyFold(fold, todoWrite(110, [
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'completed' },
      { content: 'c', status: 'pending' },
    ]))
    fold = applyFold(fold, toolResult(120, { diffs: [{ path: 'x.ts', oldText: 'a', newText: 'a\nb' }] }))
    fold = applyFold(fold, turnEnd(130, 'error'))

    const entry = finalize('s1', fold, 200)
    expect(entry).toMatchObject({
      sessionId: 's1',
      status: 'failed',
      startedAt: 100,
      finishedAt: 200,
      durationMs: 100,
      completedTodos: 2,
      totalTodos: 3,
      files: { paths: ['x.ts'], additions: 2, deletions: 1 },
    })
    expect(entry.error).toBe('error')
  })

  it('defaults to success when no turn ended yet', () => {
    let fold = initialFold()
    fold = applyFold(fold, directPrompt(100))
    const entry = finalize('s1', fold, 150)
    expect(entry.status).toBe('success')
    expect(entry.durationMs).toBe(50)
  })

  it('falls back to finishedAt when the task has no start', () => {
    const entry = finalize('s1', initialFold(), 150)
    expect(entry.startedAt).toBe(150)
    expect(entry.durationMs).toBe(0)
    expect(entry.totalTodos).toBe(0)
  })
})

describe('sanitizeSettings', () => {
  it('keeps only known, well-typed fields', () => {
    expect(sanitizeSettings({
      keepAfterDoneMs: 5000,
      autoExpandFailed: true,
      historyLimit: 3,
      showDuration: false,
      showCurrentOp: true,
      evil: 'x',
    })).toEqual({
      keepAfterDoneMs: 5000,
      autoExpandFailed: true,
      historyLimit: 3,
      showDuration: false,
      showCurrentOp: true,
    })
  })

  it('rejects out-of-range and non-boolean values', () => {
    expect(sanitizeSettings({ historyLimit: 4, keepAfterDoneMs: 'soon', autoExpandFailed: 1 })).toEqual({})
    expect(sanitizeSettings({ keepAfterDoneMs: 9_999_999 })).toEqual({ keepAfterDoneMs: 60_000 })
    expect(sanitizeSettings({ keepAfterDoneMs: -5 })).toEqual({ keepAfterDoneMs: 0 })
    expect(sanitizeSettings(null)).toEqual({})
  })
})

describe('sanitizeHistory', () => {
  const valid = {
    sessionId: 's1',
    status: 'success',
    startedAt: 100,
    finishedAt: 200,
    durationMs: 100,
    completedTodos: 1,
    totalTodos: 2,
    files: { paths: ['a.ts'], additions: 3, deletions: 1 },
  }

  it('keeps valid rows in order and caps at the limit', () => {
    const input = [valid, { ...valid, sessionId: 's2' }, { ...valid, sessionId: 's3' }]
    expect(sanitizeHistory(input, 2).map(entry => entry.sessionId)).toEqual(['s1', 's2'])
  })

  it('drops corrupt rows individually', () => {
    const input = [
      valid,
      { ...valid, status: 'weird' },
      { ...valid, durationMs: 'long' },
      { ...valid, files: { paths: 'nope' } },
      { ...valid, sessionId: 7 },
      { ...valid, completedTodos: NaN },
    ]
    expect(sanitizeHistory(input, 10)).toEqual([valid])
  })

  it('rejects non-arrays and malformed file stats', () => {
    expect(sanitizeHistory(null, 5)).toEqual([])
    expect(sanitizeHistory({}, 5)).toEqual([])
    expect(sanitizeHistory([{ ...valid, files: undefined }], 5)).toEqual([])
  })

  it('keeps the optional frames and retriedFrom fields when well-typed', () => {
    const entry = { ...valid, frames: 42, retriedFrom: 's0:1' }
    expect(sanitizeHistory([entry], 5)).toEqual([entry])
    // Malformed optional fields drop the row (same rule as `error`).
    expect(sanitizeHistory([{ ...valid, frames: 'many' }], 5)).toEqual([])
    expect(sanitizeHistory([{ ...valid, retriedFrom: 7 }], 5)).toEqual([])
  })
})

describe('finalize — frame telemetry (P0-3)', () => {
  it('archives the frame count when provided', () => {
    const entry = finalize('s1', initialFold(), 100, { frames: 17 })
    expect(entry.frames).toBe(17)
    expect(finalize('s1', initialFold(), 100).frames).toBeUndefined()
  })
})

describe('retryLinkFor (P0-2)', () => {
  const entry = (sessionId: string, startedAt: number, status: 'success' | 'failed') => ({
    sessionId, status, startedAt, finishedAt: startedAt + 10, durationMs: 10,
    completedTodos: 0, totalTodos: 0, files: { paths: [], additions: 0, deletions: 0 },
  })

  it('links a new entry to the latest failed attempt of the same session', () => {
    const ring = [entry('s2', 300, 'success'), entry('s1', 200, 'failed'), entry('s1', 100, 'failed')]
    expect(retryLinkFor(ring, { sessionId: 's1' })).toBe('s1:200')
  })

  it('returns nothing when no prior failure exists', () => {
    expect(retryLinkFor([entry('s1', 100, 'success')], { sessionId: 's1' })).toBeUndefined()
    expect(retryLinkFor([entry('s2', 100, 'failed')], { sessionId: 's1' })).toBeUndefined()
  })
})

describe('aggregateChildren (P0-1)', () => {
  const capsule = (todos: Array<{ status: string }>, files: CapsuleState['files']): CapsuleState =>
    ({ todos: todos as never, files, startedAt: 1 })

  it('sums todo counts and file stats across children', () => {
    const summary = aggregateChildren([
      { sessionId: 'c1', capsule: capsule(
        [{ status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }],
        { paths: ['a.ts'], additions: 3, deletions: 1 },
      ) },
      { sessionId: 'c2', capsule: capsule(
        [{ status: 'completed' }, { status: 'completed' }],
        { paths: ['b.ts'], additions: 0, deletions: 2 },
      ) },
    ])

    expect(summary.totals).toEqual({ done: 3, active: 1, pending: 1, files: 2, additions: 3, deletions: 3 })
    expect(summary.children).toHaveLength(2)
    expect(summary.children[1]).toMatchObject({ sessionId: 'c2', done: 2, active: 0, pending: 0 })
  })

  it('returns empty totals for no children', () => {
    expect(aggregateChildren([]).totals).toEqual({ done: 0, active: 0, pending: 0, files: 0, additions: 0, deletions: 0 })
  })
})
