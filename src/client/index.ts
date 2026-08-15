/**
 * dsh-task-capsule browser half: registers the session-header capsule — a
 * compact, always-visible task status indicator (phase 2: status → task →
 * time, nothing management-shaped). Phase 3 lifts two of the phase-2 cuts:
 * the settings panel section (runtime toggles writing to the plugin's own
 * settings resource) and the recent-task list inside the expanded panel.
 *
 * Data flows through the framework session kit (`useProjection` for the
 * host-computed capsule facts, `useSession` for the live status) plus the
 * tiny same-origin `/api/task-capsule` resources for display flags and the
 * recent-task ring.
 * @module dsh-task-capsule/client
 */

import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the conversation header-utilities SlotMap merge and the
// `ctx.locale` service merge into scope.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CapsuleChip } from './CapsuleChip.tsx'
import { SettingsSection } from './SettingsSection.tsx'
import { installSessionOpener } from './session-nav.ts'
import { en, NS, zh } from './locales.ts'

/** Required services for locale registration and the slot entries. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Browser plugin body: mount the session-header capsule and the settings
 * section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-capsule: dictionaries')
  // Locale-bound translator for the settings-nav label (a thunk so the
  // label follows the active locale; the shell resolves it at read time).
  const t = ctx.locale.bind(NS)

  // Wire the recent-task list's click-to-open through the sessions runtime.
  // (`ctx.sessions` is host-typed as the session STORE in this mixed program;
  // the client runtime's outward face is the ISessions contract.)
  installSessionOpener(sessionId => {
    (ctx.sessions as unknown as ISessions).open(sessionId as SessionId)
  })

  // The capsule: a compact status pill in the session header's utility
  // strip, expanding into the task panel.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'task-capsule',
      order: 10,
      locale: NS,
    }, CapsuleChip))

  // The settings section: one page in the harness settings panel, writing
  // to the plugin's own /api/task-capsule/settings resource.
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'task-capsule',
      order: 50,
      locale: NS,
      label: () => t('settings.title'),
    }, SettingsSection))
}

export type { CapsuleChipProps } from './CapsuleChip.tsx'
export type { CapsulePanelProps } from './CapsulePanel.tsx'
export type { TaskCapsuleApi } from './api.ts'
export { deriveStatus } from './status.ts'
export { formatDuration, describeCall } from './format.ts'
