import { eq, lt, and } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { changeLog } from '../../db/schema';

// Cloudflare Workers direct waitUntil import (compat_date >= 2025-08-08).
// Keeps the isolate alive after the Response is returned so the D1 write completes.
// Falls back to fire-and-forget in local dev where the import may not exist.
let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
try {
  // Dynamic import to avoid build errors in non-Workers environments
  const mod = await import('cloudflare:workers');
  waitUntil = mod.waitUntil;
} catch {
  // Not running on Cloudflare Workers (e.g. local dev) — fire-and-forget is fine
}

/**
 * Log a change to the change_log table for multi-device sync.
 *
 * On ~1% of calls, piggyback a cleanup of entries older than 24 hours.
 */
async function logChangeAsync(
  db: DrizzleD1Database,
  userId: string,
  entityType: string,
  entityId: string,
  parentId: string | null,
  action: string,
  data: unknown,
  sourceId: string | null
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await db.insert(changeLog).values({
    clerk_user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    parent_id: parentId,
    action,
    data: data ? JSON.stringify(data) : null,
    source_id: sourceId,
    created_at: now,
  });

  // Piggyback cleanup on ~1% of calls
  if (Math.random() < 0.01) {
    const cutoff = now - 86400; // 24 hours ago
    await db
      .delete(changeLog)
      .where(and(eq(changeLog.clerk_user_id, userId), lt(changeLog.created_at, cutoff)))
      .catch(() => {
        // Cleanup failure is non-critical
      });
  }
}

/**
 * Schedule a change log write that survives after the Response is returned.
 * Uses Cloudflare's waitUntil when available, otherwise fire-and-forget.
 */
export function logChange(
  db: DrizzleD1Database,
  userId: string,
  entityType: string,
  entityId: string,
  parentId: string | null,
  action: string,
  data: unknown,
  sourceId: string | null
): void {
  const promise = logChangeAsync(
    db,
    userId,
    entityType,
    entityId,
    parentId,
    action,
    data,
    sourceId
  ).catch(() => {
    // Non-critical — don't fail the request
  });

  if (waitUntil) {
    waitUntil(promise);
  }
}

/**
 * Extract the source ID from a request's X-Source-ID header.
 */
export function getSourceId(request: Request): string | null {
  return request.headers.get('X-Source-ID');
}
