export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { masterItems } from '../../../../db/schema';
import { masterItemUpdateSchema } from '../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
  NotFoundError,
} from '../../../lib/api-helpers';
import { fetchMasterItemWithCategory, requireOwnedCategory } from '../../../lib/master-items';

const sync = { entityType: 'masterItem' };

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const item = await fetchMasterItemWithCategory(db, userId, params.id);
  if (!item) throw new NotFoundError('Item not found');
  return item;
}, 'fetch master item');

export const PATCH: APIRoute = createPatchHandler(
  async ({ db, userId, validatedData, params }) => {
    const { name, description, category_id, default_quantity, is_container } = validatedData;
    if (category_id) await requireOwnedCategory(db, userId, category_id);

    // Drizzle leaves out undefined fields, so only the fields sent are updated.
    const updated = await db
      .update(masterItems)
      .set({
        name,
        description,
        category_id,
        default_quantity,
        is_container,
        updated_at: new Date(),
      })
      .where(and(eq(masterItems.id, params.id), eq(masterItems.clerk_user_id, userId)))
      .returning({ id: masterItems.id })
      .get();

    return updated && (await fetchMasterItemWithCategory(db, userId, updated.id));
  },
  'update master item',
  masterItemUpdateSchema,
  sync
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params }) => {
    const deleted = await db
      .delete(masterItems)
      .where(and(eq(masterItems.id, params.id), eq(masterItems.clerk_user_id, userId)))
      .returning({ id: masterItems.id })
      .get();
    return deleted?.id ?? false;
  },
  'delete master item',
  sync
);
