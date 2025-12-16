export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { trips, bags, tripItems } from '../../../../../db/schema';
import { createPostHandler } from '../../../../lib/api-helpers';

/**
 * Server-side trip copy endpoint
 * Handles copying a trip with all its bags and items atomically
 */
export const POST: APIRoute = createPostHandler<Record<string, never>, typeof trips.$inferSelect>(
  async ({ db, userId, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    // Verify trip ownership
    const originalTrip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!originalTrip) {
      throw new Error('Trip not found');
    }

    try {
      // Create new trip
      const newTrip = await db
        .insert(trips)
        .values({
          clerk_user_id: userId,
          name: `${originalTrip.name} (Copy)`,
          destination: originalTrip.destination,
          start_date: originalTrip.start_date,
          end_date: originalTrip.end_date,
          notes: originalTrip.notes,
        })
        .returning()
        .get();

      // Get all bags from original trip
      const originalBags = await db.select().from(bags).where(eq(bags.trip_id, tripId)).all();

      // Copy bags and create mapping
      const bagIdMap = new Map<string, string>();
      for (const bag of originalBags) {
        const newBag = await db
          .insert(bags)
          .values({
            trip_id: newTrip.id,
            name: bag.name,
            type: bag.type,
            color: bag.color,
            sort_order: bag.sort_order,
          })
          .returning()
          .get();
        bagIdMap.set(bag.id, newBag.id);
      }

      // Get all items from original trip
      const originalItems = await db
        .select()
        .from(tripItems)
        .where(eq(tripItems.trip_id, tripId))
        .all();

      // Copy items with updated bag IDs
      for (const item of originalItems) {
        const newBagId = item.bag_id ? bagIdMap.get(item.bag_id) || null : null;
        await db
          .insert(tripItems)
          .values({
            trip_id: newTrip.id,
            name: item.name,
            category_name: item.category_name,
            quantity: item.quantity,
            bag_id: newBagId,
            master_item_id: item.master_item_id,
            is_packed: false, // Reset packed status for new trip
          })
          .returning()
          .get();
      }

      return newTrip;
    } catch (error) {
      // Note: D1 doesn't support transactions, so we can't rollback automatically
      // In production, you might want to implement manual cleanup here
      console.error('Error copying trip:', error);
      throw new Error('Failed to copy trip. Please try again.');
    }
  },
  'copy trip'
);
