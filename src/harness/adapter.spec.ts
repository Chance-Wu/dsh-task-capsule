/**
 * Fold unit tests: task boundary, timings, file statistics, and the
 * same-reference contract for unconsumed events.
 * @module dsh-task-capsule/harness/adapter.spec
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent, TodoItem } from '@deepseek-ai/dsh-session'
import { applyFold, emptyFiles, initialFold } from './adapter.ts'
import { diffsFromMeta, goalPhaseOf, isDirectPrompt } from './event-parser.ts'
import { historyStatusOf } from './task-mapper.ts'
import type { CapsuleFoldState } from './adapter.ts'

/** Sequence counter so tests need not track seq by hand. */
let seq = 0

/** Build a committed session event, casting the minimal data to the union. */
function ev(type: string, time: number, data: unknown): SessionEvent {
  seq += 1
  return { type, seq, time, data } as unknown as SessionEvent
}

/** A direct human prompt (source kind `user`) — the task boundary. */
function directPrompt(time: number): SessionEvent {
  return ev('user/message', time, { id: `m${time}`, role: 'user', content: [], source: { kind: 'user' } })
}

function turnStart(time: number): SessionEvent {
  return ev('turn/start', time, { turn: 1 })
}

function turnEnd(time: number, kind: string): SessionEvent {
  return ev('turn/end', time, { turn: 1, reason: { kind } })
}

function todoWrite(time: number, todos: TodoItem[]): SessionEvent {
  return ev('todo/write', time, { todos })
}

function toolResult(time: number, meta: unknown): SessionEvent {
  return ev('tool/result', time, { turn: 1, step: 1, message: {}, meta })
}

describe('isDirectPrompt', () => {
  it('accepts only source kind `user`', () => {
    expect(isDirectPrompt(directPrompt(1))).toBe(true)
    expect(isDirectPrompt(ev('user/message', 2, { role: 'user', content: [], source: { kind: 'plugin', plugin: 'x' } }))).toBe(false)
    expect(isDirectPrompt(turnStart(3))).toBe(false)
  })
})

describe('applyFold — task boundary', () => {
  it('resets every per-task fact on a direct prompt', () => {
    let state = initialFold()
    state = applyFold(state, todoWrite(100, [{ content: 'a', status: 'in_progress' }]))
    state = applyFold(state, turnEnd(200, 'completed'))
    state = applyFold(state, directPrompt(300))

    expect(state.capsule).toEqual({ todos: [], startedAt: 300, files: emptyFiles() })
    expect(state.capsule.lastTurnEndReason).toBeUndefined()
    expect(state.timing.size).toBe(0)
  })

  it('keeps accumulating across turns until the next direct prompt', () => {
    let state = initialFold()
    state = applyFold(state, directPrompt(100))
    state = applyFold(state, turnStart(101))
    state = applyFold(state, todoWrite(110, [{ content: 'a', status: 'in_progress' }]))
    state = applyFold(state, turnEnd(200, 'completed'))
    state = applyFold(state, turnStart(210)) // next turn, same task

    expect(state.capsule.startedAt).toBe(100)
    expect(state.capsule.todos).toHaveLength(1)
    expect(state.capsule.lastTurnEndReason).toBe('completed')
  })
})

describe('applyFold — timing and outcome', () => {
  it('records first in_progress and completed timestamps per item', () => {
    let state = initialFold()
    state = applyFold(state, todoWrite(100, [{ content: 'a', status: 'pending' }]))
    state = applyFold(state, todoWrite(200, [{ content: 'a', status: 'in_progress' }]))
    state = applyFold(state, todoWrite(300, [{ content: 'a', status: 'completed' }]))

    expect(state.capsule.todos).toEqual([{ content: 'a', status: 'completed', startedAt: 200, completedAt: 300 }])
  })

  it('prunes items that leave the list', () => {
    let state = initialFold()
    state = applyFold(state, todoWrite(100, [{ content: 'a', status: 'in_progress' }]))
    state = applyFold(state, todoWrite(200, [{ content: 'b', status: 'pending' }]))

    expect(state.capsule.todos.map(t => t.content)).toEqual(['b'])
    expect(state.timing.has('a')).toBe(false)
  })

  it('records the last turn/end reason kind', () => {
    let state = initialFold()
    state = applyFold(state, turnEnd(100, 'error'))
    expect(state.capsule.lastTurnEndReason).toBe('error')
    state = applyFold(state, turnStart(110))
    state = applyFold(state, turnEnd(120, 'completed'))
    expect(state.capsule.lastTurnEndReason).toBe('completed')
  })
})

describe('applyFold — file statistics', () => {
  it('accumulates unique paths and line counts from tool/result meta', () => {
    let state = initialFold()
    state = applyFold(state, toolResult(100, {
      diffs: [
        { path: 'a.ts', oldText: null, newText: 'x\ny' },
        { path: 'a.ts', oldText: 'x', newText: 'z' },
      ],
    }))
    state = applyFold(state, toolResult(200, {
      diffs: [{ path: 'b.ts', oldText: 'p\nq', newText: null }],
    }))

    expect(state.capsule.files.paths).toEqual(['a.ts', 'b.ts'])
    expect(state.capsule.files.additions).toBe(3) // x\ny (2) + z (1)
    expect(state.capsule.files.deletions).toBe(3) // x (1) + p\nq (2)
  })

  it('treats malformed or absent meta as no change to files', () => {
    let state = initialFold()
    state = applyFold(state, toolResult(100, undefined))
    state = applyFold(state, toolResult(200, { notDiffs: true }))
    expect(state.capsule.files).toEqual(emptyFiles())
  })
})

describe('applyFold — goal phase and identity contract', () => {
  it('reads goal/change phase defensively', () => {
    let state = initialFold()
    state = applyFold(state, ev('goal/change', 100, { kind: 'goal/change', goal: { phase: 'paused' } }))
    expect(state.capsule.goalPhase).toBe('paused')
    expect(goalPhaseOf(ev('goal/change', 101, { goal: { phase: 'complete' } }))).toBe('complete')
    expect(goalPhaseOf(turnStart(102))).toBeUndefined()
  })

  it('returns the same reference for unconsumed events', () => {
    const state = initialFold()
    expect(applyFold(state, ev('assistant/chunk', 100, { turn: 1, step: 1, chunk: {} }))).toBe(state)
    expect(applyFold(state, ev('request/header', 100, { header: {}, reason: 'initial' }))).toBe(state)
  })
})

describe('diffsFromMeta', () => {
  it('narrows valid diffs and rejects garbage', () => {
    const diffs = diffsFromMeta({ diffs: [{ path: 'a', oldText: null, newText: 'x' }] })
    expect(diffs).toEqual([{ path: 'a', oldText: null, newText: 'x' }])
    expect(diffsFromMeta({ diffs: [{ path: 'a', oldText: 'x', newText: 'x' }] })).toEqual([{ path: 'a', oldText: 'x', newText: 'x' }])
    expect(diffsFromMeta({ diffs: [] })).toBeUndefined()
    expect(diffsFromMeta(undefined)).toBeUndefined()
    expect(diffsFromMeta({ diffs: 'nope' })).toBeUndefined()
  })
})

describe('historyStatusOf', () => {
  it('maps turn/end kinds onto history outcomes', () => {
    expect(historyStatusOf('completed')).toBe('success')
    expect(historyStatusOf('error')).toBe('failed')
    expect(historyStatusOf('aborted')).toBe('aborted')
    expect(historyStatusOf('interrupted')).toBe('interrupted')
    expect(historyStatusOf('max-tokens')).toBe('success')
    expect(historyStatusOf('blocked')).toBe('success')
  })
})

describe('applyFold — turn/end completion inference', () => {
  it('advances the in-progress item to completed on a completed turn', () => {
    let state = initialFold()
    state = applyFold(state, todoWrite(100, [{ content: 'a', status: 'in_progress' }]))
    state = applyFold(state, turnEnd(200, 'completed'))

    expect(state.capsule.todos[0]!.status).toBe('completed')
    expect(state.capsule.todos[0]!.completedAt).toBe(200)
  })

  it('keeps the plan untouched on failing, stalled, or token-capped turns', () => {
    for (const kind of ['error', 'aborted', 'interrupted', 'blocked', 'max-tokens']) {
      let state = initialFold()
      state = applyFold(state, todoWrite(100, [{ content: 'a', status: 'in_progress' }]))
      state = applyFold(state, turnEnd(200, kind))
      expect(state.capsule.todos[0]!.status, kind).toBe('in_progress')
    }
  })

  it('preserves pending items when the active one completes', () => {
    let state = initialFold()
    state = applyFold(state, todoWrite(100, [
      { content: 'a', status: 'in_progress' },
      { content: 'b', status: 'pending' },
    ]))
    state = applyFold(state, turnEnd(200, 'completed'))

    expect(state.capsule.todos.map(t => t.status)).toEqual(['completed', 'pending'])
  })
})

describe('applyFold — frame storm guard', () => {
  it('returns the same reference for tool/result without diffs', () => {
    let state = initialFold()
    state = applyFold(state, todoWrite(100, [{ content: 'a', status: 'in_progress' }]))
    const before = state

    expect(applyFold(state, toolResult(200, undefined))).toBe(before)
    expect(applyFold(state, toolResult(300, { notDiffs: true }))).toBe(before)
    // ...but a diff-carrying result still folds and changes the reference.
    expect(applyFold(state, toolResult(400, { diffs: [{ path: 'a.ts', oldText: null, newText: 'x' }] }))).not.toBe(before)
  })
})

/** Keep the fold-state type referenced so typecheck covers the export. */
export type { CapsuleFoldState }
