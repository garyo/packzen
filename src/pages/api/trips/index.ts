export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, desc, count, sql } from 'drizzle-orm';
import { z } from 'zod';
import { trips, bags, tripItems } from '../../../../db/schema';
import { tripCreateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  createPostHandler,
  getBillingStatus,
  errorResponse,
  getDatabaseConnection,
  getUserId,
  successResponse,
  handleApiError,
} from '../../../lib/api-helpers';
import { checkTripLimit } from '../../../lib/resource-limits';
import { normalizeTripDates } from '../../../lib/utils';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  // Get all trips with bag and item statistics
  const tripsWithStats = await db
    .select({
      id: trips.id,
      clerk_user_id: trips.clerk_user_id,
      name: trips.name,
      destination: trips.destination,
      start_date: trips.start_date,
      end_date: trips.end_date,
      notes: trips.notes,
      created_at: trips.created_at,
      updated_at: trips.updated_at,
      bag_count: sql<number>`COALESCE((SELECT COUNT(*) FROM bags WHERE bags.trip_id = trips.id), 0)`,
      items_total: sql<number>`CAST(COALESCE((SELECT COUNT(*) FROM trip_items WHERE trip_items.trip_id = trips.id), 0) AS INTEGER)`,
      items_packed: sql<number>`CAST(COALESCE((SELECT COUNT(*) FROM trip_items WHERE trip_items.trip_id = trips.id AND trip_items.is_packed = 1), 0) AS INTEGER)`,
    })
    .from(trips)
    .where(eq(trips.clerk_user_id, userId))
    .orderBy(desc(trips.start_date))
    .all();

  return tripsWithStats;
}, 'fetch trips');

export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const billingStatus = getBillingStatus(context.locals);

    // Validate request body
    const body = await context.request.json();
    const validation = validateRequestSafe(tripCreateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    // Check resource limit
    const [{ tripCount }] = await db
      .select({ tripCount: count() })
      .from(trips)
      .where(eq(trips.clerk_user_id, userId));

    const limitCheck = checkTripLimit(tripCount, billingStatus);
    if (!limitCheck.allowed) {
      return errorResponse(limitCheck.message!, 403);
    }

    const { name, destination, start_date, end_date, notes } = validation.data;
    const normalizedDates = normalizeTripDates(start_date || null, end_date || null);

    const newTrip = await db
      .insert(trips)
      .values({
        clerk_user_id: userId,
        name,
        destination: destination || null,
        start_date: normalizedDates.startDate,
        end_date: normalizedDates.endDate,
        notes: notes || null,
      })
      .returning()
      .get();

    return successResponse(newTrip, 201);
  } catch (error) {
    return handleApiError(error, 'create trip');
  }
};
