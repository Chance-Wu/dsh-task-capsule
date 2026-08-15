/**
 * Status-derivation unit tests. The live snapshot is built minimally and
 * cast — these functions only read `pending`.
 * @module dsh-task-capsule/client/status.spec
 */

import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CapsuleState } from '../types/capsule.ts'
import { deriveStatus, isWaiting, waitingReason } from './status.ts'

/** A snapshot whose only relevant fields are pending/queue. */
function snap(pending: unknown[], queue: unknown[] = []): ConversationSnapshot {
  return { pending, queue } as unknown as ConversationSnapshot
}

/** A minimal capsule with only the given facts set. */
function capsule(facts: Partial<CapsuleState>): CapsuleState {
  return { todos: [], files: { paths: [], additions: 0, deletions: 0 }, ...facts }
}

describe('deriveStatus', () => {
  it('lets a pending approval outrank running', () => {
    const snapshot = snap([{ kind: 'approval', payload: { toolName: 'bash' } }])
    expect(deriveStatus({ ...snapshot, running: true }, undefined)).toBe('waiting')
  })

  it('reports running before terminal reasons', () => {
    const state = capsule({ lastTurnEndReason: 'completed' })
    expect(deriveStatus(snap([]), state)).toBe('success')
    expect(deriveStatus({ ...snap([]), running: true }, state)).toBe('running')
  })

  it('maps terminal turn reasons', () => {
    expect(deriveStatus(snap([]), capsule({ lastTurnEndReason: 'error' }))).toBe('failed')
    expect(deriveStatus(snap([]), capsule({ lastTurnEndReason: 'aborted' }))).toBe('failed')
    expect(deriveStatus(snap([]), capsule({ lastTurnEndReason: 'blocked' }))).toBe('waiting')
    expect(deriveStatus(snap([]), capsule({ lastTurnEndReason: 'max-tokens' }))).toBe('success')
    expect(deriveStatus(snap([]), undefined)).toBe('pending')
  })

  it('reads an idle agent with queued work as a turn gap, not success', () => {
    const done = capsule({ lastTurnEndReason: 'completed' })
    expect(deriveStatus(snap([], [{ kind: 'steer' }]), done)).toBe('turnGap')
    expect(deriveStatus(snap([], [{ kind: 'steer' }]), undefined)).toBe('pending')
  })

  it('maps the goal phase to paused', () => {
    expect(deriveStatus(snap([]), capsule({ goalPhase: 'paused' }))).toBe('paused')
    expect(deriveStatus(snap([]), capsule({ goalPhase: 'complete' }))).toBe('pending')
  })
})

describe('isWaiting / waitingReason', () => {
  it('detects approval and question waits', () => {
    expect(isWaiting(snap([{ kind: 'approval', payload: {} }]))).toBe(true)
    expect(isWaiting(snap([{ kind: 'question', payload: { questions: [] } }]))).toBe(true)
    expect(isWaiting(snap([]))).toBe(false)
  })

  it('reports the first pending approval with tool and reason', () => {
    const snapshot = snap([
      { kind: 'approval', payload: { toolName: 'bash', reason: 'needs network' } },
      { kind: 'question', payload: { questions: [{ question: 'pick one' }] } },
    ])
    expect(waitingReason(snapshot)).toEqual({ kind: 'approval', tool: 'bash', reason: 'needs network' })
  })

  it('reports the first question text', () => {
    expect(waitingReason(snap([{ kind: 'question', payload: { questions: [{ question: 'which dir?' }] } }])))
      .toEqual({ kind: 'question', text: 'which dir?' })
  })

  it('returns undefined when nothing waits', () => {
    expect(waitingReason(snap([]))).toBeUndefined()
  })
})
