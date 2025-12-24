export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { trips } from '../../../../../db/schema';
import { tripUpdateSchema, validateRequestSafe } from '../../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
} from '../../../../lib/api-helpers';
import { normalizeTripDates } from '../../../../lib/utils';

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const { tripId } = params;
  if (!tripId) {
    throw new Error('Trip ID is required');
  }

  const trip = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
    .get();

  if (!trip) {
    throw new Error('Trip not found');
  }

  return trip;
}, 'fetch trip');

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof tripUpdateSchema>,
  typeof trips.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    const existingTrip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!existingTrip) {
      return null;
    }

    const { name, destination, start_date, end_date, notes } = validatedData;

    // Build update object dynamically
    type TripUpdate = Partial<
      Pick<typeof trips.$inferSelect, 'name' | 'destination' | 'start_date' | 'end_date' | 'notes'>
    >;
    const updates: TripUpdate & { updated_at: Date } = { updated_at: new Date() };
    if (name !== undefined) updates.name = name;
    if (destination !== undefined) updates.destination = destination;
    if (start_date !== undefined || end_date !== undefined) {
      const normalized = normalizeTripDates(
        start_date === undefined ? existingTrip.start_date : start_date,
        end_date === undefined ? existingTrip.end_date : end_date
      );
      updates.start_date = normalized.startDate;
      updates.end_date = normalized.endDate;
    }
    if (notes !== undefined) updates.notes = notes;

    return await db
      .update(trips)
      .set(updates)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .returning()
      .get();
  },
  'update trip',
  (data) => validateRequestSafe(tripUpdateSchema, data)
);

export const PUT: APIRoute = createPatchHandler<
  z.infer<typeof tripUpdateSchema>,
  typeof trips.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    const { name, destination, start_date, end_date, notes } = validatedData;
    const normalizedDates = normalizeTripDates(start_date || null, end_date || null);

    return await db
      .update(trips)
      .set({
        name,
        destination,
        start_date: normalizedDates.startDate,
        end_date: normalizedDates.endDate,
        notes,
        updated_at: new Date(),
      })
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .returning()
      .get();
  },
  'update trip (PUT)',
  (data) => validateRequestSafe(tripUpdateSchema, data)
);

export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId, params, request }) => {
  const { tripId } = params;
  if (!tripId) {
    return false;
  }

  const deleted = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
    .returning()
    .get();

  return !!deleted;
}, 'delete trip');
