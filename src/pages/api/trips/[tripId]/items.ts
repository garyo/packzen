import type { APIRoute } from 'astro';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { tripItems, trips } from '../../../../../db/schema';
import { tripItemCreateSchema, tripItemUpdateSchema, validateRequestSafe } from '../../../../lib/validation';
import { createGetHandler, createPostHandler, createPatchHandler, createDeleteHandler } from '../../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(
  async ({ db, userId, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      throw new Error('Trip not found');
    }

    return await db
      .select()
      .from(tripItems)
      .where(eq(tripItems.trip_id, tripId))
      .orderBy(asc(tripItems.name))
      .all();
  },
  'fetch trip items'
);

export const POST: APIRoute = createPostHandler<
  z.infer<typeof tripItemCreateSchema>,
  typeof tripItems.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      throw new Error('Trip not found');
    }

    const { name, category_name, quantity, bag_id, master_item_id } = validatedData;

    return await db
      .insert(tripItems)
      .values({
        trip_id: tripId,
        name,
        category_name: category_name || null,
        quantity: quantity || 1,
        bag_id: bag_id || null,
        master_item_id: master_item_id || null,
        is_packed: false,
      })
      .returning()
      .get();
  },
  'create trip item',
  (data) => validateRequestSafe(tripItemCreateSchema, data)
);

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof tripItemUpdateSchema>,
  typeof tripItems.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      throw new Error('Trip not found');
    }

    const { id, is_packed, quantity, bag_id, category_name, name } = validatedData;

    // Build update object dynamically
    type TripItemUpdate = Partial<Pick<typeof tripItems.$inferSelect, 'name' | 'category_name' | 'quantity' | 'bag_id' | 'is_packed'>>;
    const updates: TripItemUpdate & { updated_at: Date } = { updated_at: new Date() };
    if (is_packed !== undefined) updates.is_packed = is_packed;
    if (quantity !== undefined) updates.quantity = quantity;
    if (bag_id !== undefined) updates.bag_id = bag_id;
    if (category_name !== undefined) updates.category_name = category_name;
    if (name !== undefined) updates.name = name;

    return await db
      .update(tripItems)
      .set(updates)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
      .returning()
      .get();
  },
  'update trip item',
  (data) => validateRequestSafe(tripItemUpdateSchema, data)
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params, request }) => {
    const { tripId } = params;
    if (!tripId) {
      return false;
    }

    const body = await request.json();
    const { id } = body;

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      return false;
    }

    const deleted = await db
      .delete(tripItems)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
      .returning()
      .get();

    return !!deleted;
  },
  'delete trip item'
);
