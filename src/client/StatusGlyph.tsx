/**
 * The capsule's status glyph (phase 2 §1, §3): one small mark per status —
 * a breathing dot while working, a static ✓ / ! / ○ for the rest. No
 * spinner, no confetti: the running dot breathes gently (opacity pulse) so
 * the user feels "working" without the anxiety of a loader.
 * @module dsh-task-capsule/client/StatusGlyph
 */

import type { CapsuleStatus } from '../types/capsule.ts'
import css from './Capsule.module.css'

/** The status mark for a capsule status. */
export function StatusGlyph({ status, className }: { status: CapsuleStatus; className?: string }) {
  switch (status) {
    case 'running':
      return (
        <span className={`${css.glyph} ${css.glyphRunning} ${className ?? ''}`} aria-hidden>
          <span className={css.glyphDot} />
        </span>
      )
    case 'waiting':
      return (
        <span className={`${css.glyph} ${css.glyphWaiting} ${className ?? ''}`} aria-hidden>
          <span className={css.glyphDot} />
        </span>
      )
    case 'paused':
      return (
        <span className={`${css.glyph} ${css.glyphPaused} ${className ?? ''}`} aria-hidden>
          <span className={css.pauseBar} />
          <span className={css.pauseBar} />
        </span>
      )
    case 'turnGap':
      // Between turns: the pause mark, muted — a step boundary, not a stop.
      return (
        <span className={`${css.glyph} ${css.glyphTurnGap} ${className ?? ''}`} aria-hidden>
          <span className={css.pauseBar} />
          <span className={css.pauseBar} />
        </span>
      )
    case 'success':
      return (
        <span className={`${css.glyph} ${css.glyphSuccess} ${className ?? ''}`} aria-hidden>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M10 3.2L4.8 8.4C4.6 8.6 4.3 8.6 4.1 8.4L2 6.3L2.9 5.4L4.45 6.95L9.1 2.3L10 3.2Z" fill="currentColor" />
          </svg>
        </span>
      )
    case 'failed':
      return (
        <span className={`${css.glyph} ${css.glyphFailed} ${className ?? ''}`} aria-hidden>
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <rect x="5.2" y="2" width="1.6" height="5" rx="0.8" fill="currentColor" />
            <rect x="5.2" y="8.4" width="1.6" height="1.6" rx="0.8" fill="currentColor" />
          </svg>
        </span>
      )
    default:
      return (
        <span className={`${css.glyph} ${css.glyphPending} ${className ?? ''}`} aria-hidden>
          <span className={css.glyphRing} />
        </span>
      )
  }
}
