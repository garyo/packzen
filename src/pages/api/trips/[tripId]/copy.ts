export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { trips, bags, tripItems } from '../../../../../db/schema';
import {
  getDatabaseConnection,
  getUserId,
  successResponse,
  errorToResponse,
  requireOwnedTrip,
  enforceLimit,
} from '../../../../lib/api-helpers';
import { chunkRowsForInsert } from '../../../../lib/d1';
import { logChange, getSourceId } from '../../../../lib/sync';

/**
 * Server-side trip copy endpoint
 * Copies a trip with all its bags and items in a single atomic db.batch()
 * call, so a mid-copy failure can't leave a partial "ghost" trip behind.
 */
export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection();
    const userId = getUserId(context.locals);
    const originalTrip = await requireOwnedTrip(db, userId, context.params.tripId!);

    // A copy consumes a trip slot and as many item slots as the source trip
    // has, same as creating them from scratch would.
    const tripCount = await db.$count(trips, eq(trips.clerk_user_id, userId));
    await enforceLimit(context.locals, 'maxTrips', tripCount + 1);

    const originalBags = await db
      .select()
      .from(bags)
      .where(eq(bags.trip_id, originalTrip.id))
      .all();
    const originalItems = await db
      .select()
      .from(tripItems)
      .where(eq(tripItems.trip_id, originalTrip.id))
      .all();
    await enforceLimit(context.locals, 'maxItemsPerTrip', originalItems.length);

    // Pre-generate every new ID so bag/container relationships can be wired
    // up before any row is inserted, letting the whole copy run as one batch.
    const now = new Date();
    const newTripId = crypto.randomUUID();
    const bagIdMap = new Map(originalBags.map((bag) => [bag.id, crypto.randomUUID()]));
    const itemIdMap = new Map(originalItems.map((item) => [item.id, crypto.randomUUID()]));

    const newTrip: typeof trips.$inferSelect = {
      id: newTripId,
      clerk_user_id: userId,
      name: `${originalTrip.name} (Copy)`,
      destination: originalTrip.destination,
      start_date: originalTrip.start_date,
      end_date: originalTrip.end_date,
      notes: originalTrip.notes,
      created_at: now,
      updated_at: now,
    };

    const newBags: (typeof bags.$inferSelect)[] = originalBags.map((bag) => ({
      id: bagIdMap.get(bag.id)!,
      trip_id: newTripId,
      name: bag.name,
      type: bag.type,
      color: bag.color,
      sort_order: bag.sort_order,
      created_at: now,
    }));

    const newItems: (typeof tripItems.$inferSelect)[] = originalItems.map((item) => ({
      id: itemIdMap.get(item.id)!,
      trip_id: newTripId,
      bag_id: item.bag_id ? (bagIdMap.get(item.bag_id) ?? null) : null,
      master_item_id: item.master_item_id,
      container_item_id: item.container_item_id
        ? (itemIdMap.get(item.container_item_id) ?? null)
        : null,
      is_container: item.is_container,
      name: item.name,
      category_name: item.category_name,
      quantity: item.quantity,
      is_packed: false, // Reset packed status for new trip
      is_skipped: false, // Reset skipped status for new trip
      notes: item.notes,
      created_at: now,
      updated_at: now,
    }));

    await db.batch([
      db.insert(trips).values(newTrip),
      ...chunkRowsForInsert(bags, newBags).map((chunk) => db.insert(bags).values(chunk)),
      ...chunkRowsForInsert(tripItems, newItems).map((chunk) => db.insert(tripItems).values(chunk)),
    ]);

    logChange(
      db,
      userId,
      { entityType: 'trip', entityId: newTrip.id, parentId: null, action: 'create', data: newTrip },
      getSourceId(context.request)
    );
    return successResponse(newTrip, 201);
  } catch (error) {
    return errorToResponse(error, 'copy trip');
  }
};
