/**
 * CapsulePanel component tests (jsdom): the three functional gaps lifted in
 * 0.4.x — the plan-less current-operation line, the failure retry button,
 * and the expandable subagent breakdown. The panel's REST calls are stubbed
 * through a mocked global fetch so the subagent/history sections resolve
 * deterministically; the locale seat interpolates the real zh dictionary.
 * @vitest-environment jsdom
 * @module dsh-task-capsule/client/CapsulePanel.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CapsuleSettings, CapsuleState } from '../types/capsule.ts'
import { CapsulePanel, type CapsulePanelProps } from './CapsulePanel.tsx'
import { zh } from './locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

function renderPanel(
  snapshot: ConversationSnapshot,
  value: CapsuleState | undefined,
  settings: CapsuleSettings | null = null,
  status: 'running' | 'success' | 'failed' = snapshot.running ? 'running' : 'success',
): void {
  const props = {
    snap: snapshot,
    capsule: value,
    status,
    now: 5_000,
    settings,
    titleOf: (id: string) => id,
    onClose: () => {},
    t: t as never,
  } as unknown as CapsulePanelProps
  render(<CapsulePanel {...props} />)
}

/** Stub the panel's REST surface: parent summary + empty history ring. */
function stubFetch(summary: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path.startsWith('/api/task-capsule/parent')) {
      return { ok: true, json: async () => ({ summary }) }
    }
    if (path.startsWith('/api/task-capsule/history')) {
      return { ok: true, json: async () => ({ entries: [] }) }
    }
    if (path.startsWith('/api/task-capsule/settings')) {
      return { ok: true, json: async () => ({ settings: {} }) }
    }
    return { ok: true, json: async () => ({ result: { ok: true } }) }
  }))
}

const bashCall = [{ name: 'bash', argsRaw: '{"command":"ls -la"}' }] as never

describe('CapsulePanel — plan-less current operation (gap 1)', () => {
  it('shows the live operation line without a todo plan', () => {
    renderPanel(snap({ running: true, runningCalls: bashCall }), capsule({ startedAt: 1000 }))

    // The command text survives clipping (under 64 chars) and the tool badge
    // carries the tool name.
    expect(screen.getByText('ls -la')).toBeDefined()
    expect(screen.getByText('bash')).toBeDefined()
  })

  it('hides the operation line when showCurrentOp is off', () => {
    renderPanel(
      snap({ running: true, runningCalls: bashCall }),
      capsule({ startedAt: 1000 }),
      { showCurrentOp: false, keepAfterDoneMs: 8000, autoExpandFailed: false, autoExpandRunning: true, historyLimit: 5, showDuration: true, alwaysVisible: false, showProgress: true, density: 'comfortable', accent: 'auto', traceFrames: false },
    )

    expect(screen.queryByText('ls -la')).toBeNull()
  })
})

describe('CapsulePanel — failure retry (gap 2)', () => {
  it('offers a retry button next to view-details on a failed task', () => {
    renderPanel(snap({ lastAgentError: 'boom' }), capsule({
      startedAt: 1000,
      lastTurnEndReason: 'error',
    }), null, 'failed')

    expect(screen.getByText('boom')).toBeDefined()
    expect(screen.getByRole('button', { name: '查看详情' })).toBeDefined()
    expect(screen.getByRole('button', { name: '重试' })).toBeDefined()
  })
})

describe('CapsulePanel — subagent breakdown (gaps 3+4)', () => {
  it('expands the aggregate row into per-child rows', async () => {
    stubFetch({
      children: [
        { sessionId: 'c1', done: 1, active: 1, pending: 2, files: 3, additions: 4, deletions: 2 },
      ],
      totals: { done: 1, active: 1, pending: 2, files: 3, additions: 4, deletions: 2 },
    })
    renderPanel(snap({ running: true }), capsule({ startedAt: 1000 }))

    const toggle = await screen.findByRole('button', { name: /子代理 1/ })
    expect(toggle).toBeDefined()
    // Collapsed: no child rows yet.
    expect(screen.queryByText('c1')).toBeNull()

    fireEvent.click(toggle)
    // The child row: display title + done/total · files.
    expect(screen.getByText('c1')).toBeDefined()
    expect(screen.getByText('1/4 · 3 文件')).toBeDefined()
  })

  it('stays hidden when the session has no subagents', async () => {
    stubFetch({ children: [], totals: { done: 0, active: 0, pending: 0, files: 0, additions: 0, deletions: 0 } })
    renderPanel(snap({ running: true }), capsule({ startedAt: 1000 }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /子代理/ })).toBeNull()
    })
  })
})
