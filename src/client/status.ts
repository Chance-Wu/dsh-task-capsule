/**
 * Live status derivation for the capsule. The host fold carries durable
 * facts only; everything that changes second-to-second comes from the live
 * session snapshot (`running`, `pending`, `lastAgentError`), so the status
 * is composed here, on the client.
 * @module dsh-task-capsule/client/status
 */

import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CapsuleState, CapsuleStatus } from '../types/capsule.ts'

/**
 * The capsule status for the current snapshot. Order matters: a pending
 * approval outranks `running` (the agent is busy, but what the user sees is
 * a wait), and a blocked turn is a wait too. An idle agent with more work
 * queued is a TURN GAP, not a finished task — the plan is retained and the
 * capsule stays live instead of flashing the terminal record between turns.
 */
export function deriveStatus(snap: ConversationSnapshot, capsule: CapsuleState | undefined): CapsuleStatus {
  if (snap.pending.some(wait => wait.kind === 'approval' || wait.kind === 'question')) {
    return 'waiting'
  }
  if (snap.running) return 'running'
  if (capsule?.goalPhase === 'paused' || capsule?.goalPhase === 'blocked') return 'paused'
  const last = capsule?.lastTurnEndReason
  if (last === 'error' || last === 'aborted' || last === 'interrupted') return 'failed'
  if (last === 'blocked') return 'waiting'
  // Idle with queued/steering work after a finished turn → between turns.
  if (snap.queue.length > 0 && last !== undefined) return 'turnGap'
  // Any other recorded terminal reason (`completed`, `max-tokens`, …) means
  // the run ended — success, matching the history outcome mapping. Only a
  // session with no finished turn is still pending.
  return last !== undefined ? 'success' : 'pending'
}

/** Whether the snapshot currently blocks on user input (approval/question). */
export function isWaiting(snap: ConversationSnapshot): boolean {
  return snap.pending.some(wait => wait.kind === 'approval' || wait.kind === 'question')
}

/** Why the snapshot is waiting, when it is: the first pending interaction. */
export type WaitingReason =
  | { kind: 'approval'; tool: string; reason?: string }
  | { kind: 'question'; text: string }

/** The first pending approval/question's user-facing reason, if any. */
export function waitingReason(snap: ConversationSnapshot): WaitingReason | undefined {
  for (const wait of snap.pending) {
    if (wait.kind === 'approval') {
      const payload = wait.payload
      return { kind: 'approval', tool: payload.toolName, reason: payload.reason }
    }
    if (wait.kind === 'question') {
      const first = wait.payload.questions[0]
      if (first !== undefined) return { kind: 'question', text: first.question }
    }
  }
  return undefined
}
