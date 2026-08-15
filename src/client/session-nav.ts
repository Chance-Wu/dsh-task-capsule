/**
 * Module-level session opener: the plugin body wires the real `SessionRuntime`
 * once; components (the recent-task list) call a plain function instead of
 * reaching into cordis from React. Keeps the slot components dependency-free
 * while keeping the runtime service out of the component tree.
 * @module dsh-task-capsule/client/session-nav
 */

let open: ((sessionId: string) => void) | undefined

/** Install the runtime opener (called from the plugin body). */
export function installSessionOpener(fn: (sessionId: string) => void): void {
  open = fn
}

/** Open/select a session by id; a no-op until the plugin body installs it. */
export function openSession(sessionId: string): void {
  open?.(sessionId)
}
