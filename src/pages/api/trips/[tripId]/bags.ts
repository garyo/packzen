import type { APIRoute } from 'astro';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { bags, trips } from '../../../../../db/schema';
import { bagCreateSchema, bagUpdateSchema, validateRequestSafe } from '../../../../lib/validation';
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
      .from(bags)
      .where(eq(bags.trip_id, tripId))
      .orderBy(asc(bags.sort_order))
      .all();
  },
  'fetch bags'
);

export const POST: APIRoute = createPostHandler<
  z.infer<typeof bagCreateSchema>,
  typeof bags.$inferSelect
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

    const { name, type, color, sort_order } = validatedData;

    return await db
      .insert(bags)
      .values({
        trip_id: tripId,
        name,
        type,
        color: color || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();
  },
  'create bag',
  (data) => validateRequestSafe(bagCreateSchema, data)
);

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof bagUpdateSchema>,
  typeof bags.$inferSelect
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

    const { bag_id, name, type, color } = validatedData;

    // Build update object dynamically
    type BagUpdate = Partial<Pick<typeof bags.$inferSelect, 'name' | 'type' | 'color'>>;
    const updates: BagUpdate = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (color !== undefined) updates.color = color;

    return await db
      .update(bags)
      .set(updates)
      .where(and(eq(bags.id, bag_id), eq(bags.trip_id, tripId)))
      .returning()
      .get();
  },
  'update bag',
  (data) => validateRequestSafe(bagUpdateSchema, data)
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params, request }) => {
    const { tripId } = params;
    if (!tripId) {
      return false;
    }

    const body = await request.json();
    const { bag_id } = body;

    if (!bag_id) {
      return false;
    }

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
      .delete(bags)
      .where(and(eq(bags.id, bag_id), eq(bags.trip_id, tripId)))
      .returning()
      .get();

    return !!deleted;
  },
  'delete bag'
);
