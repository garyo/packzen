export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { categories } from '../../../../db/schema';
import { categoryCreateSchema } from '../../../lib/validation';
import {
  createGetHandler,
  createPostHandler,
  enforceLimit,
  successResponse,
} from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db.select().from(categories).where(eq(categories.clerk_user_id, userId)).all();
}, 'fetch categories');

/**
 * Get-or-create: a name the user already has (ignoring case and surrounding
 * whitespace) returns that category with 200 instead of adding a duplicate.
 */
export const POST: APIRoute = createPostHandler(
  async ({ db, userId, validatedData, locals }) => {
    const { name, icon, sort_order } = validatedData;

    const existing = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.clerk_user_id, userId),
          sql`lower(trim(${categories.name})) = lower(${name})`
        )
      )
      .get();
    if (existing) return successResponse(existing);

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
