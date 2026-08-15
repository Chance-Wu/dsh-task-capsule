/**
 * The recent-task list (design §12, surfaced now that the phase-2 "no recent
 * tasks" boundary is lifted): finished tasks from the host's persisted ring,
 * read through the same `/api/task-capsule/history` resource the host
 * archives, with a one-line stats summary (today / success rate / average).
 * Purely informational — no navigation, no filtering, no management UI: the
 * capsule stays a status indicator.
 * @module dsh-task-capsule/client/HistoryList
 */

import { useEffect, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CapsuleStatus, HistoryEntry, HistoryStatus } from '../types/capsule.ts'
import { apiOf } from './api.ts'
import { formatDuration, historyStats } from './format.ts'
import { NS, STATUS_KEYS } from './locales.ts'
import css from './Capsule.module.css'

/** History outcome → capsule status word (aborted/interrupted read as failed). */
const HISTORY_STATUS_KEY: Record<HistoryStatus, CapsuleStatus> = {
  success: 'success',
  failed: 'failed',
  aborted: 'failed',
  interrupted: 'failed',
}

/** Props for the recent-task section of the expanded panel. */
export interface HistoryListProps {
  t: TranslateNS<typeof NS>
}

export function HistoryList({ t }: HistoryListProps) {
  const [entries, setEntries] = useState<readonly HistoryEntry[] | null>(null)

  // One fetch per mount (the ring is low-frequency by design — no polling).
  useEffect(() => {
    let alive = true
    apiOf().history()
      .then(value => { if (alive) setEntries(value) })
      .catch(() => { /* the section stays hidden when the resource is missing */ })
    return () => { alive = false }
  }, [])

  if (entries === null || entries.length === 0) return null
  const stats = historyStats(entries, Date.now())

  return (
    <div className={css.recent}>
      <div className={css.recentHeader}>
        <span className={css.recentTitle}>{t('panel.recent')}</span>
        <span className={css.recentStats}>
          {t('panel.stats', { today: stats.today, rate: stats.successRate, avg: formatDuration(stats.avgDurationMs) })}
        </span>
      </div>
      <ul className={css.recentList}>
        {entries.map(entry => (
          <li key={`${entry.sessionId}-${entry.startedAt}`} className={css.recentItem} data-status={entry.status}>
            <span className={css.recentStatus}>{t(STATUS_KEYS[HISTORY_STATUS_KEY[entry.status]])}</span>
            <span className={css.recentCounts}>{entry.completedTodos}/{entry.totalTodos}</span>
            <span className={css.recentDuration}>{formatDuration(entry.durationMs)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
