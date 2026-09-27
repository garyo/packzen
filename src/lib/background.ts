import { waitUntil } from 'cloudflare:workers';

/**
 * Run `promise` past the end of the request: Workers' waitUntil keeps the
 * isolate alive until it settles. It must handle its own errors.
 */
export function runInBackground(promise: Promise<unknown>): void {
  waitUntil(promise);
}
