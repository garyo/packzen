/**
 * Deletes all of a user's data. Used by the Clerk `user.deleted` webhook.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
  masterItems,
  trips,
  categories,
  bagTemplates,
  changeLog,
  analyticsEvents,
} from '../../db/schema';

/**
 * Delete all data for a user, atomically. D1 enforces foreign keys, so
 * deleting trips cascades to their bags and trip items.
 */
export async function deleteAllUserData(userId: string, db: DrizzleD1Database): Promise<void> {
  await db.batch([
    db.delete(trips).where(eq(trips.clerk_user_id, userId)),
    db.delete(masterItems).where(eq(masterItems.clerk_user_id, userId)),
    db.delete(categories).where(eq(categories.clerk_user_id, userId)),
    db.delete(bagTemplates).where(eq(bagTemplates.clerk_user_id, userId)),
    // change_log rows hold full entity JSON (trip names, notes)
    db.delete(changeLog).where(eq(changeLog.clerk_user_id, userId)),
    db.delete(analyticsEvents).where(eq(analyticsEvents.clerk_user_id, userId)),
  ]);
  console.log(`Deleted all data for user ${userId}`);
}
