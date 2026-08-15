/**
 * Same-origin fetch client for the task-capsule API. Client bundles run on
 * the served origin, so relative `/api/task-capsule` reaches the host
 * routes mounted by the host half. The browser half consumes three small
 * resources: the display flags that shape the capsule (GET/PUT), and the
 * recent-task ring (GET) that feeds the panel's history section.
 * @module dsh-task-capsule/client/api
 */

import type { CapsuleSettings, HistoryEntry } from '../types/capsule.ts'

/** Wire shape of the settings response. */
export interface SettingsResponse {
  settings: CapsuleSettings
}

/** Wire shape of the history response. */
export interface HistoryResponse {
  entries: HistoryEntry[]
}

/** The tiny API surface the browser half consumes. */
export interface TaskCapsuleApi {
  settings(): Promise<CapsuleSettings>
  update(patch: Partial<CapsuleSettings>): Promise<CapsuleSettings>
  history(): Promise<HistoryEntry[]>
}

export function apiOf(): TaskCapsuleApi {
  return {
    settings: () => getJson('/api/task-capsule/settings').then(body => (body as SettingsResponse).settings),
    update: patch => putJson('/api/task-capsule/settings', patch).then(body => (body as SettingsResponse).settings),
    history: () => getJson('/api/task-capsule/history').then(body => (body as HistoryResponse).entries),
  }
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`task-capsule: GET ${path} failed with ${response.status}`)
  }
  return response.json()
}

async function putJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`task-capsule: PUT ${path} failed with ${response.status}`)
  }
  return response.json()
}
