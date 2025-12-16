/**
 * User Data Cleanup Utilities
 *
 * Shared logic for deleting all user data from the database.
 * Used by both the delete-account API endpoint and webhook handler.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { masterItems, trips, tripItems, bags, categories, bagTemplates } from '../../db/schema';

/**
 * Delete all data for a user
 * @param userId - The Clerk user ID
 * @param db - Drizzle database connection
 */
export async function deleteAllUserData(userId: string, db: DrizzleD1Database): Promise<void> {
  console.log(`Deleting all data for user ${userId}`);

  // 1. Get all user trips
  const userTrips = await db.select().from(trips).where(eq(trips.clerk_user_id, userId)).all();

  // 2. Delete trip items and bags for each trip (respecting foreign keys)
  for (const trip of userTrips) {
    await db.delete(tripItems).where(eq(tripItems.trip_id, trip.id)).run();
    await db.delete(bags).where(eq(bags.trip_id, trip.id)).run();
  }

  // 3. Delete trips
  await db.delete(trips).where(eq(trips.clerk_user_id, userId)).run();

  // 4. Delete master items
  await db.delete(masterItems).where(eq(masterItems.clerk_user_id, userId)).run();

  // 5. Delete categories
  await db.delete(categories).where(eq(categories.clerk_user_id, userId)).run();

  // 6. Delete bag templates
  await db.delete(bagTemplates).where(eq(bagTemplates.clerk_user_id, userId)).run();

  console.log(`Successfully deleted all data for user ${userId}`);
}
