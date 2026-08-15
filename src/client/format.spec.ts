/**
 * Formatting helper tests (phase 2: clock-style durations, the pending
 * dash, and the running-call description).
 * @module dsh-task-capsule/client/format.spec
 */

import { describe, expect, it } from 'vitest'
import { clipLong, describeCall, durationLabel, formatDuration, todoCounts } from './format.ts'

describe('formatDuration', () => {
  it('renders MM:SS under an hour', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(18_000)).toBe('00:18')
    expect(formatDuration(102_000)).toBe('01:42')
    expect(formatDuration(59_000)).toBe('00:59')
    expect(formatDuration(3_599_000)).toBe('59:59')
  })

  it('widens to HH:MM:SS past an hour', () => {
    expect(formatDuration(3_600_000)).toBe('01:00:00')
    expect(formatDuration(4_362_000)).toBe('01:12:42')
  })

  it('clamps negatives', () => {
    expect(formatDuration(-5)).toBe('00:00')
  })
})

describe('durationLabel', () => {
  it('shows a dash for an unstarted task, not a misleading 00:00', () => {
    expect(durationLabel(undefined, 1000)).toBe('—')
  })

  it('shows the clock once the task has started', () => {
    expect(durationLabel(0, 42_000)).toBe('00:42')
  })
})

describe('clipLong', () => {
  it('returns short labels unchanged', () => {
    expect(clipLong('修复登录模块', 20)).toBe('修复登录模块')
    expect(clipLong('', 20)).toBe('')
  })

  it('keeps both ends with an ellipsis when over the limit', () => {
    const clipped = clipLong('修复用户登录模块中 Token 过期导致的会话失效问题', 20)
    expect(clipped.startsWith('修复用户登录模块中')).toBe(true)
    expect(clipped.endsWith('会话失效问题')).toBe(true)
    expect(clipped).toContain('…')
    expect(clipped.length).toBe(20)
  })

  it('never exceeds the limit', () => {
    expect(clipLong('a'.repeat(100), 12).length).toBe(12)
    expect(clipLong('长'.repeat(100), 7).length).toBe(7)
  })
})

describe('describeCall', () => {
  const call = (name: string, argsRaw: string) => ({ name, argsRaw }) as never

  it('prefers the command for bash calls', () => {
    expect(describeCall(call('bash', '{"command":"mvn test"}'))).toBe('mvn test')
  })

  it('prefers the file path for fs calls', () => {
    expect(describeCall(call('write', '{"file_path":"a.ts"}'))).toBe('a.ts')
    expect(describeCall(call('edit', '{"path":"b.ts"}'))).toBe('b.ts')
  })

  it('falls back to the tool name on unreadable arguments', () => {
    expect(describeCall(call('str_replace', 'not json'))).toBe('str_replace')
  })
})

describe('todoCounts', () => {
  const item = (status: 'pending' | 'in_progress' | 'completed') => ({ content: 'x', status })

  it('counts completed, in-progress, and pending items', () => {
    const todos = [item('completed'), item('completed'), item('in_progress'), item('pending'), item('pending')]
    expect(todoCounts(todos)).toEqual({ done: 2, active: 1, pending: 2 })
  })

  it('returns zeros for an empty plan', () => {
    expect(todoCounts([])).toEqual({ done: 0, active: 0, pending: 0 })
  })
})
