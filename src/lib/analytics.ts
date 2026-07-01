/**
 * First-party product analytics.
 *
 * Append-only, best-effort event logging for the activation funnel. Analytics
 * must NEVER break or slow a user request: every write is fire-and-forget and
 * all errors are swallowed. On Cloudflare Workers the write is kept alive past
 * the Response via waitUntil; elsewhere it's plain fire-and-forget.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { analyticsEvents } from '../../db/schema';

// Keep the isolate alive after the Response so the D1 write completes.
// Falls back to fire-and-forget in local dev where the import may not exist.
let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
try {
  const mod = await import('cloudflare:workers');
  waitUntil = mod.waitUntil;
} catch {
  // Not running on Cloudflare Workers (e.g. local dev) — fire-and-forget is fine
}

interface LogEventOptions {
  userId?: string | null;
  props?: Record<string, unknown>;
}

async function insertEvent(
  db: DrizzleD1Database,
  event: string,
  opts: LogEventOptions
): Promise<void> {
  await db.insert(analyticsEvents).values({
    clerk_user_id: opts.userId ?? null,
    event,
    props: opts.props ? JSON.stringify(opts.props) : null,
  });
}

/**
 * Record a single analytics event. Best-effort and non-blocking: it never
 * throws and never rejects, so callers can ignore the returned promise.
 */
export async function logEvent(
  db: DrizzleD1Database,
  event: string,
  opts: LogEventOptions = {}
): Promise<void> {
  try {
    const promise = insertEvent(db, event, opts).catch(() => {
      // Non-critical — analytics must never fail a request
    });

    if (waitUntil) {
      waitUntil(promise);
    }
  } catch {
    // Swallow everything (e.g. synchronous failures building the insert)
  }
}
