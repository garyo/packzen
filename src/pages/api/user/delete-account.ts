export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import {
  masterItems,
  trips,
  tripItems,
  bags,
  categories,
  bagTemplates,
} from '../../../../db/schema';
import { createDeleteHandler } from '../../../lib/api-helpers';

/**
 * DELETE /api/user/delete-account
 * Permanently deletes ALL user data (trips, items, categories, etc.)
 * This cannot be undone!
 */
export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId }) => {
  // Delete all user data in order (respecting foreign keys)

  // 1. Get all user trips
  const userTrips = await db.select().from(trips).where(eq(trips.clerk_user_id, userId)).all();

  // 2. Delete trip items and bags for each trip
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

  return true;
}, 'delete account data');
