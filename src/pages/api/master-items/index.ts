import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { masterItems, categories } from '../../../../db/schema';
import { masterItemCreateSchema, validateRequestSafe } from '../../../lib/validation';
import { createGetHandler, createPostHandler } from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(
  async ({ db, userId }) => {
    return await db
      .select({
        id: masterItems.id,
        clerk_user_id: masterItems.clerk_user_id,
        category_id: masterItems.category_id,
        name: masterItems.name,
        description: masterItems.description,
        default_quantity: masterItems.default_quantity,
        created_at: masterItems.created_at,
        updated_at: masterItems.updated_at,
        category_name: categories.name,
      })
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.clerk_user_id, userId))
      .all();
  },
  'fetch master items'
);

type MasterItemWithCategory = {
  id: string;
  clerk_user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  default_quantity: number;
  created_at: Date;
  updated_at: Date;
  category_name: string | null;
};

export const POST: APIRoute = createPostHandler<
  z.infer<typeof masterItemCreateSchema>,
  MasterItemWithCategory
>(
  async ({ db, userId, validatedData }) => {
    const { name, description, category_id, default_quantity } = validatedData;

    const newItem = await db
      .insert(masterItems)
      .values({
        clerk_user_id: userId,
        name,
        description: description || null,
        category_id: category_id || null,
        default_quantity: default_quantity || 1,
      })
      .returning()
      .get();

    // Fetch the item with category name
    const result = await db
      .select({
        id: masterItems.id,
        clerk_user_id: masterItems.clerk_user_id,
        category_id: masterItems.category_id,
        name: masterItems.name,
        description: masterItems.description,
        default_quantity: masterItems.default_quantity,
        created_at: masterItems.created_at,
        updated_at: masterItems.updated_at,
        category_name: categories.name,
      })
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.id, newItem.id))
      .get();

    if (!result) {
      throw new Error('Failed to fetch created item');
    }

    return result;
  },
  'create master item',
  (data) => validateRequestSafe(masterItemCreateSchema, data)
);
