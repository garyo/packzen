// Cloudflare Workers' waitUntil keeps the isolate alive after the Response is
// returned so background work (D1 writes, pings) completes. Outside Workers
// (local tests) the import fails and background work is plain fire-and-forget.
let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
try {
  ({ waitUntil } = await import('cloudflare:workers'));
} catch {
  // Not running on Cloudflare Workers
}

/** Run `promise` past the end of the request. It must handle its own errors. */
export function runInBackground(promise: Promise<unknown>): void {
  waitUntil?.(promise);
}
