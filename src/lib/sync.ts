import { lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { changeLog } from '../../db/schema';
import { runInBackground } from './background';
import { chunkRowsForInsert } from './d1';

export interface Change {
  entityType: string;
  entityId: string;
  parentId: string | null;
  action: 'create' | 'update' | 'delete';
  data: unknown;
}

/** Change-log rows older than this are pruned; devices offline longer do a full refetch. */
const RETENTION_SECONDS = 24 * 60 * 60;

async function writeChanges(
  db: DrizzleD1Database,
  userId: string,
  changes: Change[],
  sourceId: string | null
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const rows = changes.map((change) => ({
    clerk_user_id: userId,
    entity_type: change.entityType,
    entity_id: change.entityId,
    parent_id: change.parentId,
    action: change.action,
    data: change.data ? JSON.stringify(change.data) : null,
    source_id: sourceId,
    created_at: now,
  }));
  const [first, ...rest] = chunkRowsForInsert(changeLog, rows).map((chunk) =>
    db.insert(changeLog).values(chunk)
  );
  await db.batch([first, ...rest]);

  // Piggyback a prune of every user's old rows on ~1% of writes.
  if (Math.random() < 0.01) {
    await db
      .delete(changeLog)
      .where(lt(changeLog.created_at, now - RETENTION_SECONDS))
      .catch((error) => console.error('change_log prune failed:', error));
  }
}

/**
 * Record changes for multi-device sync, in the background so the request
 * doesn't wait on it.
 */
export function logChanges(
  db: DrizzleD1Database,
  userId: string,
  changes: Change[],
  sourceId: string | null
): void {
  if (changes.length === 0) return;
  runInBackground(
    writeChanges(db, userId, changes, sourceId).catch((error) => {
      // Don't fail the request, but a lost write means other devices never
      // learn of these changes — make it visible.
      console.error('logChanges failed:', changes.length, changes[0]?.entityType, error);
    })
  );
}

export function logChange(
  db: DrizzleD1Database,
  userId: string,
  change: Change,
  sourceId: string | null
): void {
  logChanges(db, userId, [change], sourceId);
}

/**
 * Extract the source ID from a request's X-Source-ID header.
 */
export function getSourceId(request: Request): string | null {
  return request.headers.get('X-Source-ID');
}
