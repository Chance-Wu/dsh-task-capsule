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
  'status.turnGap': '回合间隔',
  'waiting.approval': '等待确认 · {tool}',
  'waiting.approval.reason': '等待确认 · {tool}（{reason}）',
  'waiting.question': '等待用户回答 · {question}',
  'panel.title': 'Task Capsule',
  'panel.close': '关闭',
  'panel.currentOp': '正在执行',
  'panel.error.view': '查看详情',
  'panel.error.detail': '错误详情',
  'chip.counts': '任务 已完成{done} 进行中{active} 待处理{pending}',
  'chip.sessionTask': '会话任务处理',
  'history.aborted': '已中止',
  'history.interrupted': '已中断',
  'panel.recent': '最近任务',
  'panel.allDone': '全部完成',
  'panel.files': '改动 {count} 个文件 · +{additions} −{deletions}',
  'panel.stats': '今日 {today} · 本周 {week} · 成功率 {rate}% · 平均 {avg}',
  'panel.goal': '目标',
  'panel.retry': '重试',
  'panel.open': '打开',
  'settings.loading': '加载中…',
  'settings.title': '任务胶囊',
  'settings.showDuration': '显示逐任务耗时',
  'settings.showCurrentOp': '显示当前操作',
  'settings.autoExpandFailed': '失败时自动展开',
  'settings.autoExpandRunning': '任务进行时自动展开',
  'settings.alwaysVisible': '始终显示胶囊',
  'settings.showProgress': '显示进度条',
  'settings.density': '面板密度',
  'settings.densityComfortable': '舒适',
  'settings.densityCompact': '紧凑',
  'settings.accent': '强调色',
  'settings.accentAuto': '自动',
  'settings.accentBusiness': '业务蓝',
  'settings.accentSuccess': '成功绿',
  'settings.accentWarn': '警告黄',
  'settings.accentError': '错误红',
  'settings.traceFrames': '调试：追踪投影帧',
  'settings.keepAfterDoneMs': '完成态保留时长（毫秒）',
  'settings.historyLimit': '历史容量',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TaskCapsuleKey, string> = {
  'status.pending': 'Pending',
  'status.running': 'Running',
  'status.waiting': 'Waiting',
  'status.success': 'Task completed',
  'status.failed': 'Task failed',
  'status.paused': 'Paused',
  'status.turnGap': 'Between turns',
  'waiting.approval': 'Waiting · {tool}',
  'waiting.approval.reason': 'Waiting · {tool} ({reason})',
  'waiting.question': 'Awaiting your answer · {question}',
  'panel.title': 'Task Capsule',
  'panel.close': 'Close',
  'panel.currentOp': 'Running',
  'panel.error.view': 'View details',
  'panel.error.detail': 'Error detail',
  'chip.counts': 'Task {done} done · {active} active · {pending} pending',
  'chip.sessionTask': 'Task processing',
  'history.aborted': 'Aborted',
  'history.interrupted': 'Interrupted',
  'panel.recent': 'Recent tasks',
  'panel.allDone': 'All done',
  'panel.files': '{count} files · +{additions} −{deletions}',
  'panel.stats': 'Today {today} · week {week} · {rate}% success · avg {avg}',
  'panel.goal': 'Goal',
  'panel.retry': 'Retry',
  'panel.open': 'Open',
  'settings.loading': 'Loading…',
  'settings.title': 'Task Capsule',
  'settings.showDuration': 'Show per-task durations',
  'settings.showCurrentOp': 'Show current operation',
  'settings.autoExpandFailed': 'Auto-expand on failure',
  'settings.autoExpandRunning': 'Auto-expand while running',
  'settings.alwaysVisible': 'Always show the capsule',
  'settings.showProgress': 'Show progress bar',
  'settings.density': 'Panel density',
  'settings.densityComfortable': 'Comfortable',
  'settings.densityCompact': 'Compact',
  'settings.accent': 'Accent',
  'settings.accentAuto': 'Auto',
  'settings.accentBusiness': 'Business',
  'settings.accentSuccess': 'Success',
  'settings.accentWarn': 'Warning',
  'settings.accentError': 'Error',
  'settings.traceFrames': 'Debug: trace projection frames',
  'settings.keepAfterDoneMs': 'Completion linger (ms)',
  'settings.historyLimit': 'History limit',
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
  turnGap: 'status.turnGap',
}
