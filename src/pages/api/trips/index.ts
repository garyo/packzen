export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, desc, count } from 'drizzle-orm';
import { z } from 'zod';
import { trips } from '../../../../db/schema';
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

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db
    .select()
    .from(trips)
    .where(eq(trips.clerk_user_id, userId))
    .orderBy(desc(trips.start_date))
    .all();
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

    const newTrip = await db
      .insert(trips)
      .values({
        clerk_user_id: userId,
        name,
        destination: destination || null,
        start_date: start_date || null,
        end_date: end_date || null,
        notes: notes || null,
      })
      .returning()
      .get();

    return successResponse(newTrip, 201);
  } catch (error) {
    return handleApiError(error, 'create trip');
  }
};
