/**
 * Task-capsule browser copy. The key domain is `keyof typeof zh` (the
 * dictionary is the source of truth), matching the locale-seat contract:
 * `LocaleKeysOf<N>` intersects the namespace value with `string`, so the
 * namespace must be a string-literal union, not an interface.
 *
 * Phase 2 keeps the copy minimal — a status indicator needs status words,
 * the waiting reason, and the error entry; nothing management-shaped.
 * @module dsh-task-capsule/client/locales
 */

import type { CapsuleStatus } from '../types/capsule.ts'

export const NS = 'taskCapsule' as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-capsule browser copy. */
    'taskCapsule': TaskCapsuleKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'status.pending': '等待开始',
  'status.running': '执行中',
  'status.waiting': '等待确认',
  'status.success': '任务完成',
  'status.failed': '任务失败',
  'status.paused': '任务暂停',
  'waiting.approval': '等待确认 · {tool}',
  'waiting.approval.reason': '等待确认 · {tool}（{reason}）',
  'waiting.question': '等待用户回答 · {question}',
  'panel.title': 'Task Capsule',
  'panel.close': '关闭',
  'panel.currentOp': '正在执行',
  'panel.error.view': '查看详情',
  'panel.error.detail': '错误详情',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TaskCapsuleKey, string> = {
  'status.pending': 'Pending',
  'status.running': 'Running',
  'status.waiting': 'Waiting',
  'status.success': 'Task completed',
  'status.failed': 'Task failed',
  'status.paused': 'Paused',
  'waiting.approval': 'Waiting · {tool}',
  'waiting.approval.reason': 'Waiting · {tool} ({reason})',
  'waiting.question': 'Awaiting your answer · {question}',
  'panel.title': 'Task Capsule',
  'panel.close': 'Close',
  'panel.currentOp': 'Running',
  'panel.error.view': 'View details',
  'panel.error.detail': 'Error detail',
}

/** Key domain of the `taskCapsule` namespace (zh is the source of truth). */
export type TaskCapsuleKey = keyof typeof zh

/** Status → dictionary key; the `t` seat takes literal keys, so no templates. */
export const STATUS_KEYS: Record<CapsuleStatus, TaskCapsuleKey> = {
  pending: 'status.pending',
  running: 'status.running',
  waiting: 'status.waiting',
  success: 'status.success',
  failed: 'status.failed',
  paused: 'status.paused',
}
