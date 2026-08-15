/**
 * Settings-sanitizer unit tests: the REST PUT surface and the persisted
 * settings file both flow through `sanitizeSettings`, so its coercion and
 * rejection behavior is the security boundary of the settings feature.
 * @module dsh-task-capsule/task/task-state.spec
 */

import { describe, expect, it } from 'vitest'
import { sanitizeSettings } from './task-state.ts'

describe('sanitizeSettings', () => {
  it('passes through every known boolean flag', () => {
    expect(sanitizeSettings({
      autoExpandFailed: true,
      showDuration: false,
      showCurrentOp: true,
      alwaysVisible: true,
      showProgress: false,
      traceFrames: true,
    })).toEqual({
      autoExpandFailed: true,
      showDuration: false,
      showCurrentOp: true,
      alwaysVisible: true,
      showProgress: false,
      traceFrames: true,
    })
  })

  it('accepts closed density and accent sets and rejects others', () => {
    expect(sanitizeSettings({ density: 'compact', accent: 'warn' }))
      .toEqual({ density: 'compact', accent: 'warn' })
    expect(sanitizeSettings({ density: 'huge', accent: 'neon' })).toEqual({})
  })

  it('clamps keepAfterDoneMs into sane bounds', () => {
    expect(sanitizeSettings({ keepAfterDoneMs: -5 })).toEqual({ keepAfterDoneMs: 0 })
    expect(sanitizeSettings({ keepAfterDoneMs: 99_999 })).toEqual({ keepAfterDoneMs: 60_000 })
    expect(sanitizeSettings({ keepAfterDoneMs: 8.7 })).toEqual({ keepAfterDoneMs: 8 })
  })

  it('accepts only the closed history-limit set', () => {
    expect(sanitizeSettings({ historyLimit: 10 })).toEqual({ historyLimit: 10 })
    expect(sanitizeSettings({ historyLimit: 7 })).toEqual({})
    expect(sanitizeSettings({ historyLimit: '5' })).toEqual({})
  })

  it('rejects unknown keys and non-object input', () => {
    expect(sanitizeSettings({ showDuration: true, evil: 'x' })).toEqual({ showDuration: true })
    expect(sanitizeSettings('nope')).toEqual({})
    expect(sanitizeSettings(null)).toEqual({})
    expect(sanitizeSettings(undefined)).toEqual({})
  })
})
