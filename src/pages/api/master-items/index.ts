export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { masterItems, categories } from '../../../../db/schema';
import { masterItemCreateSchema } from '../../../lib/validation';
import {
  createGetHandler,
  createPostHandler,
  enforceLimit,
  NotFoundError,
} from '../../../lib/api-helpers';
import {
  masterItemWithCategorySelect,
  fetchMasterItemWithCategory,
  requireOwnedCategory,
} from '../../../lib/master-items';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db
    .select(masterItemWithCategorySelect)
    .from(masterItems)
    .leftJoin(categories, eq(masterItems.category_id, categories.id))
    .where(eq(masterItems.clerk_user_id, userId))
    .all();
}, 'fetch master items');

export const POST: APIRoute = createPostHandler(
  async ({ db, userId, validatedData, locals }) => {
    const count = await db.$count(masterItems, eq(masterItems.clerk_user_id, userId));
    await enforceLimit(locals, 'maxMasterItems', count + 1);

    const { name, description, category_id, default_quantity, is_container } = validatedData;
    if (category_id) await requireOwnedCategory(db, userId, category_id);

    const newItem = await db
      .insert(masterItems)
      .values({
        clerk_user_id: userId,
        name,
        description: description || null,
        category_id: category_id || null,
        default_quantity,
        is_container,
      })
      .returning()
      .get();

    const result = await fetchMasterItemWithCategory(db, userId, newItem.id);
    if (!result) throw new NotFoundError();
    return result;
  },
  'create master item',
  masterItemCreateSchema,
  { entityType: 'masterItem' }
);
