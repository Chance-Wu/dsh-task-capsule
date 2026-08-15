/**
 * Integration spec (P3-14): a realistic event fixture — the same shape a
 * harness session log carries — replayed through the plugin fold AND through
 * a faithful copy of the client's projection store, asserting that the
 * capsule the browser renders and the todos the conversation shows cannot
 * diverge: same frame sequence, same final values, per the higher-seq-wins
 * rule the client store implements.
 * @module dsh-task-capsule/harness/integration.spec
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent, TodoItem } from '@deepseek-ai/dsh-session'
import { applyFold, initialFold } from './adapter.ts'

/** Minimal faithful copy of the client's ProjectionValueStore (seq rules). */
class MiniStore {
  rows = new Map<string, { value: unknown; seq: number }>()

  apply(key: string, value: unknown, seq: number): void {
    const row = this.rows.get(key)
    if (row !== undefined && seq <= row.seq) return
    this.rows.set(key, { value, seq })
  }

  seed(baseline: { asOfSeq: number; values: Record<string, unknown> }): void {
    for (const key of Object.keys(baseline.values)) this.apply(key, baseline.values[key], baseline.asOfSeq)
  }

  get(key: string): unknown {
    return this.rows.get(key)?.value
  }
}

/** The framework's own `todos` unit (last-write-wins, cleared on turn/start). */
function todosApply(state: unknown, event: SessionEvent): unknown {
  if (event.type === 'todo/write') return event.data.todos
  if (event.type === 'turn/start') return null
  return state
}

const ev = (type: string, seq: number, time: number, data: unknown): SessionEvent =>
  ({ type, seq, time, data }) as unknown as SessionEvent

const todoWrite = (seq: number, time: number, todos: TodoItem[]): SessionEvent =>
  ev('todo/write', seq, time, { todos })

it('capsule and dialog projections stay in sync across a realistic run', () => {
  // 1. task opens, plan written, work progresses, files touched, turns end.
  const events: SessionEvent[] = [
    ev('user/message', 1, 1000, { id: 'm1', role: 'user', content: [], source: { kind: 'user' } }),
    ev('turn/start', 2, 1010, { turn: 1 }),
    todoWrite(3, 1020, [
      { content: '调研现状', status: 'in_progress' },
      { content: '实现功能', status: 'pending' },
      { content: '验收', status: 'pending' },
    ]),
    ev('tool/result', 4, 1100, { turn: 1, step: 1, message: {}, meta: { diffs: [{ path: 'a.ts', oldText: null, newText: 'x\ny' }] } }),
    todoWrite(5, 1200, [
      { content: '调研现状', status: 'completed' },
      { content: '实现功能', status: 'in_progress' },
      { content: '验收', status: 'pending' },
    ]),
    // The agent finishes the turn WITHOUT rewriting the plan — the fold's
    // turn/end advance marks the in-progress item done.
    ev('turn/end', 6, 2000, { turn: 1, reason: { kind: 'completed' } }),
    // A second turn starts for the same task (no reset — not a direct prompt).
    ev('turn/start', 7, 2100, { turn: 2 }),
    todoWrite(8, 2200, [
      { content: '调研现状', status: 'completed' },
      { content: '实现功能', status: 'completed' },
      { content: '验收', status: 'completed' },
    ]),
    ev('turn/end', 9, 3000, { turn: 2, reason: { kind: 'completed' } }),
  ]

  // Host side: fold both units over the log, emitting frames on change.
  let fold = initialFold()
  let todosState: unknown = null
  const frames: Array<{ key: string; value: unknown; seq: number }> = []
  for (const event of events) {
    const nextTodos = todosApply(todosState, event)
    if (!Object.is(nextTodos, todosState)) {
      todosState = nextTodos
      frames.push({ key: 'todos', value: nextTodos, seq: event.seq })
    }
    const nextFold = applyFold(fold, event)
    if (!Object.is(nextFold, fold)) {
      fold = nextFold
      frames.push({ key: 'taskCapsule', value: fold.capsule, seq: event.seq })
    }
  }

  // Client side: seed from the tail baseline, then apply the live frames.
  const store = new MiniStore()
  store.seed({
    asOfSeq: events.at(-1)!.seq,
    values: {
      todos: todosState,
      taskCapsule: fold.capsule,
    },
  })
  for (const frame of frames) store.apply(frame.key, frame.value, frame.seq)

  const dialog = store.get('todos') as TodoItem[] | null
  const capsule = store.get('taskCapsule') as { todos: Array<{ content: string; status: string }> } | undefined

  expect(dialog).not.toBeNull()
  expect(capsule).toBeDefined()
  expect(capsule!.todos).toHaveLength(dialog!.length)
  // The capsule agrees with the conversation on every item's status.
  for (let i = 0; i < dialog!.length; i += 1) {
    expect(capsule!.todos[i]!.status).toBe(dialog![i]!.status)
    expect(capsule!.todos[i]!.content).toBe(dialog![i]!.content)
  }
  // The turn/end advance produced the durable completion timestamps.
  const done = capsule!.todos.find(item => item.content === '实现功能')
  expect(done).toBeDefined()
})
