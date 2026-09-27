export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { bags } from '../../../../../db/schema';
import { bagCreateSchema, bagUpdateSchema } from '../../../../lib/validation';
import {
  createGetHandler,
  createPostHandler,
  createPatchHandler,
  createDeleteHandler,
  requireOwnedTrip,
  readJsonBody,
  parseWith,
  BadRequestError,
  type SyncConfig,
} from '../../../../lib/api-helpers';

const sync: SyncConfig = {
  entityType: 'bag',
  parentId: (params) => params.tripId,
};

const bagDeleteSchema = z.object({ bag_id: z.string().uuid() });

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const trip = await requireOwnedTrip(db, userId, params.tripId);
  return await db
    .select()
    .from(bags)
    .where(eq(bags.trip_id, trip.id))
    .orderBy(asc(bags.sort_order))
    .all();
}, 'fetch bags');

export const POST: APIRoute = createPostHandler(
  async ({ db, userId, validatedData, params }) => {
    const trip = await requireOwnedTrip(db, userId, params.tripId);
    const { name, type, color, sort_order } = validatedData;
    return await db
      .insert(bags)
      .values({
        trip_id: trip.id,
        name,
        type,
        color: color || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();
  },
  'create bag',
  bagCreateSchema,
  sync
);

export const PATCH: APIRoute = createPatchHandler(
  async ({ db, userId, validatedData, params }) => {
    const trip = await requireOwnedTrip(db, userId, params.tripId);
    const { bag_id, ...fields } = validatedData;
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new BadRequestError('No fields provided to update');
    }

    return await db
      .update(bags)
      .set(fields)
      .where(and(eq(bags.id, bag_id), eq(bags.trip_id, trip.id)))
      .returning()
      .get();
  },
  'update bag',
  bagUpdateSchema,
  sync
);

// Deleting a bag leaves its items in the trip: the bag_id foreign key is
// ON DELETE SET NULL, so they move to "no bag".
export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params, request }) => {
    const { bag_id } = parseWith(bagDeleteSchema, await readJsonBody(request));
    const trip = await requireOwnedTrip(db, userId, params.tripId);

    const deleted = await db
      .delete(bags)
      .where(and(eq(bags.id, bag_id), eq(bags.trip_id, trip.id)))
      .returning({ id: bags.id })
      .get();
    return deleted?.id ?? false;
  },
  'delete bag',
  sync
);
