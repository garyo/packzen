export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { trips } from '../../../../../db/schema';
import { tripUpdateSchema } from '../../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
  requireOwnedTrip,
} from '../../../../lib/api-helpers';
import { normalizeTripDates } from '../../../../lib/utils';

const sync = { entityType: 'trip' };

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  return await requireOwnedTrip(db, userId, params.tripId);
}, 'fetch trip');

export const PATCH: APIRoute = createPatchHandler(
  async ({ db, userId, validatedData, params }) => {
    const trip = await requireOwnedTrip(db, userId, params.tripId);
    const { name, destination, start_date, end_date, notes } = validatedData;

    // A one-sided date change is normalized against the stored other date;
    // null clears a date.
    const dates =
      start_date !== undefined || end_date !== undefined
        ? normalizeTripDates(
            start_date === undefined ? trip.start_date : start_date,
            end_date === undefined ? trip.end_date : end_date
          )
        : undefined;

    // Drizzle leaves out undefined fields, so only the fields sent are updated.
    return await db
      .update(trips)
      .set({
        name,
        destination,
        start_date: dates?.startDate,
        end_date: dates?.endDate,
        notes,
        updated_at: new Date(),
      })
      .where(eq(trips.id, trip.id))
      .returning()
      .get();
  },
  'update trip',
  tripUpdateSchema,
  sync
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params }) => {
    const deleted = await db
      .delete(trips)
      .where(and(eq(trips.id, params.tripId), eq(trips.clerk_user_id, userId)))
      .returning({ id: trips.id })
      .get();
    return deleted?.id ?? false;
  },
  'delete trip',
  sync
);
