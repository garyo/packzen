export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { categories } from '../../../../db/schema';
import { categoryUpdateSchema } from '../../../lib/validation';
import { createPatchHandler, createDeleteHandler, BadRequestError } from '../../../lib/api-helpers';

const sync = { entityType: 'category' };

export const PATCH: APIRoute = createPatchHandler(
  async ({ db, userId, validatedData, params }) => {
    if (Object.values(validatedData).every((value) => value === undefined)) {
      throw new BadRequestError('No fields provided to update');
    }

    return await db
      .update(categories)
      .set(validatedData)
      .where(and(eq(categories.id, params.id), eq(categories.clerk_user_id, userId)))
      .returning()
      .get();
  },
  'update category',
  categoryUpdateSchema,
  sync
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params }) => {
    const deleted = await db
      .delete(categories)
      .where(and(eq(categories.id, params.id), eq(categories.clerk_user_id, userId)))
      .returning({ id: categories.id })
      .get();
    return deleted?.id ?? false;
  },
  'delete category',
  sync
);
