/**
 * Same-origin fetch client for the task-capsule API. Client bundles run on
 * the served origin, so relative `/api/task-capsule` reaches the host
 * routes mounted by the host half. Phase 2 consumes a single resource: the
 * display flags that shape the capsule.
 * @module dsh-task-capsule/client/api
 */

import type { CapsuleSettings } from '../types/capsule.ts'

/** Wire shape of the settings response. */
export interface SettingsResponse {
  settings: CapsuleSettings
}

/** The tiny API surface the browser half consumes. */
export interface TaskCapsuleApi {
  settings(): Promise<CapsuleSettings>
}

export function apiOf(): TaskCapsuleApi {
  return {
    settings: () => getJson('/api/task-capsule/settings').then(body => (body as SettingsResponse).settings),
  }
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`task-capsule: GET ${path} failed with ${response.status}`)
  }
  return response.json()
}
