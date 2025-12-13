import type { APIRoute } from 'astro';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { trips } from '../../../../db/schema';
import { tripCreateSchema, validateRequestSafe } from '../../../lib/validation';
import { createGetHandler, createPostHandler } from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(
  async ({ db, userId }) => {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.clerk_user_id, userId))
      .orderBy(desc(trips.start_date))
      .all();
  },
  'fetch trips'
);

export const POST: APIRoute = createPostHandler<
  z.infer<typeof tripCreateSchema>,
  typeof trips.$inferSelect
>(
  async ({ db, userId, validatedData }) => {
    const { name, destination, start_date, end_date, notes } = validatedData;

    return await db
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
  },
  'create trip',
  (data) => validateRequestSafe(tripCreateSchema, data)
);
