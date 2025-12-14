import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { masterItems, categories } from '../../../../db/schema';
import { masterItemUpdateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
} from '../../../lib/api-helpers';

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

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const { id } = params;
  if (!id) {
    throw new Error('Item ID is required');
  }

  const item = await db
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
    .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
    .get();

  if (!item) {
    throw new Error('Item not found');
  }

  return item;
}, 'fetch master item');

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof masterItemUpdateSchema>,
  MasterItemWithCategory
>(
  async ({ db, userId, validatedData, params }) => {
    const { id } = params;
    if (!id) {
      throw new Error('Item ID is required');
    }

    const { name, description, category_id, default_quantity } = validatedData;

    // Build update object dynamically
    type MasterItemUpdate = Partial<
      Pick<
        typeof masterItems.$inferSelect,
        'name' | 'description' | 'category_id' | 'default_quantity'
      >
    >;
    const updates: MasterItemUpdate & { updated_at: Date } = { updated_at: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category_id !== undefined) updates.category_id = category_id;
    if (default_quantity !== undefined) updates.default_quantity = default_quantity;

    const updatedItem = await db
      .update(masterItems)
      .set(updates)
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return null;
    }

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
      .where(eq(masterItems.id, updatedItem.id))
      .get();

    return result || null;
  },
  'update master item',
  (data) => validateRequestSafe(masterItemUpdateSchema, data)
);

export const PUT: APIRoute = createPatchHandler<
  z.infer<typeof masterItemUpdateSchema>,
  MasterItemWithCategory
>(
  async ({ db, userId, validatedData, params }) => {
    const { id } = params;
    if (!id) {
      throw new Error('Item ID is required');
    }

    const { name, description, category_id, default_quantity } = validatedData;

    const updatedItem = await db
      .update(masterItems)
      .set({
        name,
        description,
        category_id,
        default_quantity,
        updated_at: new Date(),
      })
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return null;
    }

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
      .where(eq(masterItems.id, updatedItem.id))
      .get();

    return result || null;
  },
  'update master item (PUT)',
  (data) => validateRequestSafe(masterItemUpdateSchema, data)
);

export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId, params, request }) => {
  const { id } = params;
  if (!id) {
    return false;
  }

  const deleted = await db
    .delete(masterItems)
    .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
    .returning()
    .get();

  return !!deleted;
}, 'delete master item');
