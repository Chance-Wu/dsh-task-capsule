/**
 * Deterministic fold fuzz (P0-3): seeded random event sequences over the
 * fold, asserting the invariants that keep the capsule trustworthy — replay
 * determinism, last-write-wins statuses (with only the sanctioned
 * turn/end completion advance), the same-reference contract for unconsumed
 * events, and a bounded timing map.
 * @module dsh-task-capsule/harness/fold-fuzz.spec
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent, TodoItem } from '@deepseek-ai/dsh-session'
import { applyFold, initialFold } from './adapter.ts'

/** Mulberry32 — a tiny deterministic PRNG so the sequences are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STATUSES: readonly TodoItem['status'][] = ['pending', 'in_progress', 'completed']
const REASONS: readonly string[] = ['completed', 'error', 'aborted', 'interrupted', 'blocked', 'max-tokens']

/** One random event for a sequence; direct prompts reset the task. */
function randomEvent(rand: () => number, seq: number, time: number): SessionEvent {
  const kind = Math.floor(rand() * 5)
  switch (kind) {
    case 0: {
      const n = 1 + Math.floor(rand() * 4)
      const todos: TodoItem[] = []
      for (let i = 0; i < n; i += 1) {
        todos.push({ content: `t${i}`, status: STATUSES[Math.floor(rand() * STATUSES.length)]! })
      }
      return { type: 'todo/write', seq, time, data: { todos } } as unknown as SessionEvent
    }
    case 1:
      return {
        type: 'turn/end', seq, time,
        data: { turn: 1, reason: { kind: REASONS[Math.floor(rand() * REASONS.length)] } },
      } as unknown as SessionEvent
    case 2:
      return {
        type: 'tool/result', seq, time,
        data: {
          turn: 1, step: 1, message: {},
          meta: rand() < 0.3 ? { diffs: [{ path: 'a.ts', oldText: null, newText: 'x' }] } : {},
        },
      } as unknown as SessionEvent
    case 3:
      return {
        type: 'user/message', seq, time,
        data: { id: `m${seq}`, role: 'user', content: [], source: { kind: 'user' } },
      } as unknown as SessionEvent
    default:
      return { type: 'turn/start', seq, time, data: { turn: 1 } } as unknown as SessionEvent
  }
}

function sequence(seed: number, length: number): SessionEvent[] {
  const rand = rng(seed)
  const events: SessionEvent[] = []
  for (let i = 0; i < length; i += 1) {
    events.push(randomEvent(rand, i + 1, 1000 + i))
  }
  return events
}

function replay(events: readonly SessionEvent[]) {
  let state = initialFold()
  for (const event of events) state = applyFold(state, event)
  return state
}

describe('fold fuzz', () => {
  for (const seed of [1, 7, 42, 2026]) {
    it(`seed ${seed}: replay is deterministic and invariants hold`, () => {
      const events = sequence(seed, 400)
      const first = replay(events)
      const second = replay(events)

      expect(second.capsule).toEqual(first.capsule)

      // Same-reference contract: a tool/result without diffs and other
      // unconsumed events must not churn the fold.
      let state = initialFold()
      const before = state
      expect(applyFold(state, {
        type: 'assistant/chunk', seq: 9999, time: 1, data: { turn: 1, step: 1, chunk: {} },
      } as unknown as SessionEvent)).toBe(before)

      // Timing map stays bounded by the distinct contents seen.
      const distinct = new Set<string>()
      for (const event of events) {
        if (event.type === 'todo/write') {
          for (const todo of (event as unknown as { data: { todos: TodoItem[] } }).data.todos) {
            distinct.add(todo.content)
          }
        }
      }
      expect(first.timing.size).toBeLessThanOrEqual(distinct.size + 1)

      // Last-write-wins with only the sanctioned advance: find the last
      // todo/write and the last direct prompt.
      let lastWrite: { seq: number; todos: TodoItem[] } | undefined
      let lastDirectSeq = -1
      for (const event of events) {
        if (event.type === 'todo/write') {
          lastWrite = { seq: event.seq, todos: (event as unknown as { data: { todos: TodoItem[] } }).data.todos }
        }
        if (event.type === 'user/message') lastDirectSeq = event.seq
      }

      if (lastWrite === undefined) {
        expect(first.capsule.todos).toEqual([])
        return
      }
      // A direct prompt after the last write resets the plan.
      if (lastDirectSeq > lastWrite.seq) {
        expect(first.capsule.todos).toEqual([])
        return
      }
      const wrote = lastWrite.todos
      const got = first.capsule.todos
      expect(got).toHaveLength(wrote.length)
      for (let i = 0; i < wrote.length; i += 1) {
        const w = wrote[i]!
        const g = got[i]!
        expect(g.content).toBe(w.content)
        if (w.status === 'completed') expect(g.status).toBe('completed')
        else if (w.status === 'in_progress') expect(['in_progress', 'completed']).toContain(g.status)
        else expect(g.status).toBe('pending')
      }
    })
  }
})
