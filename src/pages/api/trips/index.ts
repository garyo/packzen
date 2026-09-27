export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, desc, sql } from 'drizzle-orm';
import { trips } from '../../../../db/schema';
import { tripCreateSchema } from '../../../lib/validation';
import { createGetHandler, createPostHandler, enforceLimit } from '../../../lib/api-helpers';
import { normalizeTripDates } from '../../../lib/utils';
import { logEvent } from '../../../lib/analytics';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  // Skipped items don't count toward the total, and a skipped item is never packed.
  return await db
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
      bag_count: sql<number>`(SELECT COUNT(*) FROM bags WHERE bags.trip_id = trips.id)`,
      items_total: sql<number>`(SELECT COUNT(*) FROM trip_items WHERE trip_items.trip_id = trips.id AND trip_items.is_skipped = 0)`,
      items_packed: sql<number>`(SELECT COUNT(*) FROM trip_items WHERE trip_items.trip_id = trips.id AND trip_items.is_packed = 1 AND trip_items.is_skipped = 0)`,
    })
    .from(trips)
    .where(eq(trips.clerk_user_id, userId))
    .orderBy(desc(trips.start_date))
    .all();
}, 'fetch trips');

export const POST: APIRoute = createPostHandler(
  async ({ db, userId, validatedData, locals }) => {
    const count = await db.$count(trips, eq(trips.clerk_user_id, userId));
    await enforceLimit(locals, 'maxTrips', count + 1);

    const { name, destination, start_date, end_date, notes } = validatedData;
    const dates = normalizeTripDates(start_date, end_date);

    const newTrip = await db
      .insert(trips)
      .values({
        clerk_user_id: userId,
        name,
        destination: destination || null,
        start_date: dates.startDate,
        end_date: dates.endDate,
        notes: notes || null,
      })
      .returning()
      .get();

    logEvent(db, 'trip_created', { userId, props: { tripId: newTrip.id } });
    return newTrip;
  },
  'create trip',
  tripCreateSchema,
  { entityType: 'trip' }
);
