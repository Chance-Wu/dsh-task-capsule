/**
 * The task-capsule settings section (the phase-2 "no settings center"
 * boundary, lifted): one page in the harness settings panel, registered on
 * the `settings.section` slot. Every control writes straight to the plugin's
 * own `/api/task-capsule/settings` resource — no harness settings-namespace
 * wiring needed, and the chip's runtime flags refresh from the same place.
 * @module dsh-task-capsule/client/SettingsSection
 */

import { useEffect, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CapsuleSettings } from '../types/capsule.ts'
import { apiOf } from './api.ts'
import { NS } from './locales.ts'
import css from './Capsule.module.css'

/** Props for the settings-section slot entry (owner share + locale seat). */
export interface SettingsSectionProps {
  /** Close the settings panel (the shell owns the open state). */
  close: () => void
  t: TranslateNS<typeof NS>
}

/** One labelled boolean row: a switch bound to a settings field. */
function Toggle({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className={css.settingsRow}>
      <span className={css.settingsLabel}>{label}</span>
      <input
        type="checkbox"
        className={css.settingsToggle}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
    </label>
  )
}

export function SettingsSection({ t }: SettingsSectionProps) {
  const [settings, setSettings] = useState<CapsuleSettings | null>(null)

  useEffect(() => {
    let alive = true
    apiOf().settings()
      .then(value => { if (alive) setSettings(value) })
      .catch(() => { /* the defaults stand until the resource is reachable */ })
    return () => { alive = false }
  }, [])

  if (settings === null) {
    return <div className={css.settingsSection}>{t('settings.loading')}</div>
  }

  const set = (patch: Partial<CapsuleSettings>): void => {
    apiOf().update(patch).then(setSettings).catch(() => { /* keep the current copy */ })
  }

  return (
    <div className={css.settingsSection}>
      <Toggle label={t('settings.showDuration')} checked={settings.showDuration} onChange={showDuration => set({ showDuration })} />
      <Toggle label={t('settings.showCurrentOp')} checked={settings.showCurrentOp} onChange={showCurrentOp => set({ showCurrentOp })} />
      <Toggle label={t('settings.showProgress')} checked={settings.showProgress} onChange={showProgress => set({ showProgress })} />
      <Toggle label={t('settings.autoExpandFailed')} checked={settings.autoExpandFailed} onChange={autoExpandFailed => set({ autoExpandFailed })} />
      <Toggle label={t('settings.alwaysVisible')} checked={settings.alwaysVisible} onChange={alwaysVisible => set({ alwaysVisible })} />
      <Toggle label={t('settings.traceFrames')} checked={settings.traceFrames} onChange={traceFrames => set({ traceFrames })} />
      <label className={css.settingsRow}>
        <span className={css.settingsLabel}>{t('settings.density')}</span>
        <select
          className={css.settingsSelect}
          value={settings.density}
          onChange={event => set({ density: event.target.value as CapsuleSettings['density'] })}
        >
          <option value="comfortable">{t('settings.densityComfortable')}</option>
          <option value="compact">{t('settings.densityCompact')}</option>
        </select>
      </label>
      <label className={css.settingsRow}>
        <span className={css.settingsLabel}>{t('settings.accent')}</span>
        <select
          className={css.settingsSelect}
          value={settings.accent}
          onChange={event => set({ accent: event.target.value as CapsuleSettings['accent'] })}
        >
          <option value="auto">{t('settings.accentAuto')}</option>
          <option value="business">{t('settings.accentBusiness')}</option>
          <option value="success">{t('settings.accentSuccess')}</option>
          <option value="warn">{t('settings.accentWarn')}</option>
          <option value="error">{t('settings.accentError')}</option>
        </select>
      </label>
      <label className={css.settingsRow}>
        <span className={css.settingsLabel}>{t('settings.keepAfterDoneMs')}</span>
        <input
          type="number"
          className={css.settingsNumber}
          min={0}
          step={1000}
          value={settings.keepAfterDoneMs}
          onChange={event => set({ keepAfterDoneMs: Number(event.target.value) })}
        />
      </label>
      <label className={css.settingsRow}>
        <span className={css.settingsLabel}>{t('settings.historyLimit')}</span>
        <select
          className={css.settingsSelect}
          value={settings.historyLimit}
          onChange={event => set({ historyLimit: Number(event.target.value) as 3 | 5 | 10 })}
        >
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
        </select>
      </label>
    </div>
  )
}
