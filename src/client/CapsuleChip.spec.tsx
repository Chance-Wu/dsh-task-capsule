/**
 * CapsuleChip component tests (jsdom): the three compact-title branches —
 * live with a plan (per-status counts), live without a plan (fixed
 * `会话任务处理` label), and terminal (status word + done/total progress).
 * The chip's runtime props are stubbed with plain functions; the locale seat
 * interpolates against the real zh dictionary so the assertions read the
 * actual copy.
 * @vitest-environment jsdom
 * @module dsh-task-capsule/client/CapsuleChip.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CapsuleState, CapsuleStatus, TaskItem } from '../types/capsule.ts'
import { CapsuleChip, type CapsuleChipProps } from './CapsuleChip.tsx'
import { zh } from './locales.ts'

// vitest runs without framework globals here, so testing-library's automatic
// cleanup never hooks; unmount between cases explicitly.
afterEach(cleanup)

/** Interpolating translator against the zh dictionary (source of truth). */
function t(key: string, params?: Record<string, unknown>): string {
  let text = (zh as Record<string, string>)[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

function snap(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    sessionId: 's1',
    running: false,
    pending: [],
    queue: [],
    runningCalls: [],
    lastAgentError: null,
    ...overrides,
  } as unknown as ConversationSnapshot
}

function capsule(overrides: Partial<CapsuleState> = {}): CapsuleState {
  return { todos: [], files: { paths: [], additions: 0, deletions: 0 }, ...overrides }
}

const todo = (content: string, status: TaskItem['status']): TaskItem => ({ content, status })

function renderChip(snapshot: ConversationSnapshot, value: CapsuleState | undefined): void {
  const props = {
    sessionId: 's1',
    useSession: (selector: (s: ConversationSnapshot) => unknown) => selector(snapshot),
    useProjection: (key: string) => (key === 'taskCapsule' ? value : undefined),
    useSessions: (selector: (s: { byId: Record<string, { displayTitle?: string }> }) => unknown) =>
      selector({ byId: {} }),
    t: t as never,
  } as unknown as CapsuleChipProps
  render(<CapsuleChip {...props} />)
}

describe('CapsuleChip compact title', () => {
  it('shows per-status counts while running with a plan (and auto-expands)', () => {
    renderChip(snap({ running: true }), capsule({
      startedAt: 1000,
      todos: [todo('a', 'completed'), todo('b', 'in_progress'), todo('c', 'pending')],
    }))

    const button = screen.getByRole('button', { name: /已完成1 进行中1 待处理1/ })
    expect(button.textContent).toContain('任务 已完成1 进行中1 待处理1')
    // Auto-expand on the running edge opened the panel.
    expect(screen.getByText('Task Capsule')).toBeDefined()
  })

  it('shows the fixed plan-less label while running without a plan', () => {
    renderChip(snap({ running: true }), capsule({ startedAt: 1000 }))

    const button = screen.getByRole('button', { name: /会话任务处理/ })
    expect(button.textContent).toContain('会话任务处理')
  })

  it('shows the status word with done/total progress when finished', () => {
    renderChip(snap({}), capsule({
      startedAt: 1000,
      lastTurnEndReason: 'completed',
      todos: [todo('a', 'completed'), todo('b', 'completed')],
    }))

    const button = screen.getByRole('button', { name: /任务完成/ })
    expect(button.getAttribute('aria-label')).toContain('任务完成')
    expect(button.getAttribute('aria-label')).toContain('2/2')
  })

  it('hides when idle with no activity unless alwaysVisible is set', () => {
    renderChip(snap({}), capsule({}))
    expect(screen.queryByRole('button')).toBeNull()
  })
})

/** Keep the status type referenced so the derive mapping stays covered. */
export type { CapsuleStatus }
