/**
 * First-party product analytics.
 *
 * Append-only, best-effort event logging for the activation funnel. Analytics
 * must NEVER break or slow a user request: every write runs in the background
 * and all errors are swallowed.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { analyticsEvents } from '../../db/schema';
import { runInBackground } from './background';

interface LogEventOptions {
  userId?: string | null;
  props?: Record<string, unknown>;
}

/** Record a single analytics event. Never throws. */
export function logEvent(db: DrizzleD1Database, event: string, opts: LogEventOptions = {}): void {
  try {
    runInBackground(
      db
        .insert(analyticsEvents)
        .values({
          clerk_user_id: opts.userId ?? null,
          event,
          props: opts.props ? JSON.stringify(opts.props) : null,
        })
        .catch(() => {
          // Non-critical — analytics must never fail a request
        })
    );
  } catch {
    // Swallow synchronous failures building the insert, too
  }
}
