import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { categories } from '../../../../db/schema';
import { categoryCreateSchema, validateRequestSafe } from '../../../lib/validation';
import { createGetHandler, createPostHandler } from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db.select().from(categories).where(eq(categories.clerk_user_id, userId)).all();
}, 'fetch categories');

export const POST: APIRoute = createPostHandler<
  z.infer<typeof categoryCreateSchema>,
  typeof categories.$inferSelect
>(
  async ({ db, userId, validatedData }) => {
    const { name, icon, sort_order } = validatedData;

    return await db
      .insert(categories)
      .values({
        clerk_user_id: userId,
        name,
        icon: icon || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();
  },
  'create category',
  (data) => validateRequestSafe(categoryCreateSchema, data)
);
