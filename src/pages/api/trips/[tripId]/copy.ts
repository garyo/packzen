export const prerender = false;

import type { APIRoute } from 'astro';
import type { BatchItem } from 'drizzle-orm/batch';
import { eq, and, count } from 'drizzle-orm';
import { trips, bags, tripItems } from '../../../../../db/schema';
import {
  getDatabaseConnection,
  getUserId,
  getBillingStatus,
  errorResponse,
  successResponse,
  handleApiError,
} from '../../../../lib/api-helpers';
import { checkTripLimit, checkTripItemLimit } from '../../../../lib/resource-limits';
import { chunkArray } from '../../../../lib/utils';
import { logChange, getSourceId } from '../../../../lib/sync';

// D1 caps bound variables at 100 per query; keep each insert well under that.
const BAG_INSERT_CHUNK_SIZE = 15;
const ITEM_INSERT_CHUNK_SIZE = 6;

/**
 * Server-side trip copy endpoint
 * Copies a trip with all its bags and items in a single atomic db.batch()
 * call, so a mid-copy failure can't leave a partial "ghost" trip behind.
 */
export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const billingStatus = getBillingStatus(context.locals);

    const { tripId } = context.params;
    if (!tripId) {
      return errorResponse('Trip ID is required', 400);
    }

    // Verify trip ownership
    const originalTrip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!originalTrip) {
      return errorResponse('Trip not found', 404);
    }

    // Enforce plan limits before doing any work — a copy consumes a trip slot
    // and as many item slots as the source trip has, same as creating them
    // from scratch would.
    const [{ tripCount }] = await db
      .select({ tripCount: count() })
      .from(trips)
      .where(eq(trips.clerk_user_id, userId));

    const tripLimitCheck = checkTripLimit(tripCount, billingStatus);
    if (!tripLimitCheck.allowed) {
      return errorResponse(tripLimitCheck.message!, 403);
    }

    const [{ itemCount }] = await db
      .select({ itemCount: count() })
      .from(tripItems)
      .where(eq(tripItems.trip_id, tripId));

    const itemLimitCheck = checkTripItemLimit(itemCount, billingStatus);
    if (!itemLimitCheck.allowed) {
      return errorResponse(itemLimitCheck.message!, 403);
    }

    const originalBags = await db.select().from(bags).where(eq(bags.trip_id, tripId)).all();
    const originalItems = await db
      .select()
      .from(tripItems)
      .where(eq(tripItems.trip_id, tripId))
      .all();

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

    // Build every insert as a batch item so the whole copy commits or rolls
    // back atomically — no partial trip/bags/items left behind on failure.
    const statements: BatchItem<'sqlite'>[] = [db.insert(trips).values(newTrip)];
    for (const chunk of chunkArray(newBags, BAG_INSERT_CHUNK_SIZE)) {
      statements.push(db.insert(bags).values(chunk));
    }
    for (const chunk of chunkArray(newItems, ITEM_INSERT_CHUNK_SIZE)) {
      statements.push(db.insert(tripItems).values(chunk));
    }

    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const sourceId = getSourceId(context.request);
    logChange(db, userId, 'trip', newTrip.id, null, 'create', newTrip, sourceId);

    return successResponse(newTrip, 201);
  } catch (error) {
    return handleApiError(error, 'copy trip');
  }
};
