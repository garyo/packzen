export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { categories } from '../../../../db/schema';
import { categoryUpdateSchema, validateRequestSafe } from '../../../lib/validation';
import { createPatchHandler, createDeleteHandler, errorResponse } from '../../../lib/api-helpers';

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof categoryUpdateSchema>,
  typeof categories.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const categoryId = params.id;
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    const { name, icon, sort_order } = validatedData;

    // Build update object dynamically
    type CategoryUpdate = Partial<
      Pick<typeof categories.$inferSelect, 'name' | 'icon' | 'sort_order'>
    >;
    const updates: CategoryUpdate = {};
    if (name !== undefined) updates.name = name;
    if (icon !== undefined) updates.icon = icon;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const updated = await db
      .update(categories)
      .set(updates)
      .where(and(eq(categories.id, categoryId), eq(categories.clerk_user_id, userId)))
      .returning()
      .get();

    return updated || null;
  },
  'update category',
  (data) => validateRequestSafe(categoryUpdateSchema, data)
);

export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId, params, request }) => {
  const categoryId = params.id;
  if (!categoryId) {
    return false;
  }

  const deleted = await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.clerk_user_id, userId)))
    .returning()
    .get();

  return !!deleted;
}, 'delete category');
