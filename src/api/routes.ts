/**
 * HTTP API for the task capsule, served through the Harness web server.
 *
 * Registered as a prefix route under `/api/task-capsule` — the webserver's
 * longest-prefix-wins matching routes these before the connection layer's
 * bare `/api` bridge. The browser client half calls these endpoints
 * same-origin: the recent-task ring and the runtime settings. Everything
 * else the capsule needs travels the projection/frame path, so the surface
 * stays tiny (two resources, no SSE — history is low-frequency).
 * @module dsh-task-capsule/api
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.webServer` Context merge into scope.
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sanitizeSettings } from '../task/task-state.ts'

const PREFIX = '/api/task-capsule'

/** POST/PUT bodies larger than this are rejected with 413. */
const MAX_BODY_BYTES = 16 * 1024

type Parsed =
  | { kind: 'history' }
  | { kind: 'settings' }
  | { kind: 'parent' }
  | { kind: 'not-found' }

/** Parse a task-capsule pathname into a {@link Parsed} route. */
export function parsePath(pathname: string): Parsed {
  const rest = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname
  if (rest === '/history' || rest === '/history/') return { kind: 'history' }
  if (rest === '/settings' || rest === '/settings/') return { kind: 'settings' }
  if (rest === '/parent' || rest === '/parent/') return { kind: 'parent' }
  return { kind: 'not-found' }
}

/**
 * Register the task-capsule REST surface. Mounts only when a web server is
 * present (web profile); headless assemblies simply have no HTTP surface.
 */
export function applyRoutes(ctx: Context): void {
  ctx.inject(['webServer', 'taskCapsuleHistory', 'taskCapsuleSettings'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: (req, res) => {
        void handle(req, res, webCtx)
      },
    }), 'task-capsule: api routes')
  })
}

async function handle(req: IncomingMessage, res: ServerResponse, ctx: Context): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parsed = parsePath(url.pathname)
    if (parsed.kind === 'not-found') {
      return sendJson(res, 404, { error: 'not found' })
    }
    const method = req.method ?? 'GET'
    if (parsed.kind === 'history') {
      if (method !== 'GET') {
        return sendJson(res, 405, { error: 'method not allowed (expected GET)' })
      }
      return sendJson(res, 200, { entries: ctx.taskCapsuleHistory.list() })
    }
    if (parsed.kind === 'parent') {
      // P0-1: aggregated subagent work of one parent session.
      if (method !== 'GET') {
        return sendJson(res, 405, { error: 'method not allowed (expected GET)' })
      }
      const sessionId = url.searchParams.get('sessionId')
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return sendJson(res, 400, { error: 'missing sessionId query parameter' })
      }
      return sendJson(res, 200, { summary: ctx.taskCapsuleHistory.parentSummary(sessionId) })
    }
    // settings serves GET (read) and PUT (update).
    if (method === 'GET') {
      return sendJson(res, 200, { settings: ctx.taskCapsuleSettings.get() })
    }
    if (method === 'PUT') {
      const settings = await ctx.taskCapsuleSettings.update(sanitizeSettings(await readJsonBody(req)))
      return sendJson(res, 200, { settings })
    }
    return sendJson(res, 405, { error: 'method not allowed (expected GET or PUT)' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(res, 500, { error: message })
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', chunk => {
      size += (chunk as Buffer).length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        return
      }
      chunks.push(chunk as Buffer)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(new Error(`invalid JSON body: ${error instanceof Error ? error.message : String(error)}`))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}
