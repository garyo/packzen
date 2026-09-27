export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { categories } from '../../../../db/schema';
import { categoryCreateSchema } from '../../../lib/validation';
import { createGetHandler, createPostHandler, enforceLimit } from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db.select().from(categories).where(eq(categories.clerk_user_id, userId)).all();
}, 'fetch categories');

export const POST: APIRoute = createPostHandler(
  async ({ db, userId, validatedData, locals }) => {
    const { name, icon, sort_order } = validatedData;
    const count = await db.$count(categories, eq(categories.clerk_user_id, userId));
    await enforceLimit(locals, 'maxCategories', count + 1);

    return await db
      .insert(categories)
      .values({ clerk_user_id: userId, name, icon: icon || null, sort_order: sort_order || 0 })
      .returning()
      .get();
  },
  'create category',
  categoryCreateSchema,
  { entityType: 'category' }
);
