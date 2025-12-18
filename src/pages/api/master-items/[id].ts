export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { masterItems, categories } from '../../../../db/schema';
import { masterItemUpdateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  createDeleteHandler,
  getDatabaseConnection,
  getUserId,
  errorResponse,
  successResponse,
  handleApiError,
} from '../../../lib/api-helpers';

type MasterItemWithCategory = {
  id: string;
  clerk_user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  default_quantity: number;
  is_container: boolean;
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
      is_container: masterItems.is_container,
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

export const PATCH: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);

    const { id } = context.params;
    if (!id) {
      return errorResponse('Item ID is required', 400);
    }

    // Validate request body
    const body = await context.request.json();
    const validation = validateRequestSafe(masterItemUpdateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { name, description, category_id, default_quantity, is_container } = validation.data;

    // Verify category ownership if category_id is being updated
    if (category_id !== undefined && category_id !== null) {
      const category = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, category_id), eq(categories.clerk_user_id, userId)))
        .get();

      if (!category) {
        return errorResponse('Category not found or does not belong to you', 400);
      }
    }

    // Build update object dynamically
    type MasterItemUpdate = Partial<
      Pick<
        typeof masterItems.$inferSelect,
        'name' | 'description' | 'category_id' | 'default_quantity' | 'is_container'
      >
    >;
    const updates: MasterItemUpdate & { updated_at: Date } = { updated_at: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category_id !== undefined) updates.category_id = category_id;
    if (default_quantity !== undefined) updates.default_quantity = default_quantity;
    if (is_container !== undefined) updates.is_container = is_container;

    const updatedItem = await db
      .update(masterItems)
      .set(updates)
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return errorResponse('Item not found', 404);
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
        is_container: masterItems.is_container,
        created_at: masterItems.created_at,
        updated_at: masterItems.updated_at,
        category_name: categories.name,
      })
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.id, updatedItem.id))
      .get();

    if (!result) {
      return errorResponse('Failed to fetch updated item', 500);
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, 'update master item');
  }
};

export const PUT: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);

    const { id } = context.params;
    if (!id) {
      return errorResponse('Item ID is required', 400);
    }

    // Validate request body
    const body = await context.request.json();
    const validation = validateRequestSafe(masterItemUpdateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { name, description, category_id, default_quantity, is_container } = validation.data;

    // Verify category ownership if category_id is provided
    if (category_id !== undefined && category_id !== null) {
      const category = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, category_id), eq(categories.clerk_user_id, userId)))
        .get();

      if (!category) {
        return errorResponse('Category not found or does not belong to you', 400);
      }
    }

    const updatedItem = await db
      .update(masterItems)
      .set({
        name,
        description,
        category_id,
        default_quantity,
        is_container,
        updated_at: new Date(),
      })
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return errorResponse('Item not found', 404);
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
        is_container: masterItems.is_container,
        created_at: masterItems.created_at,
        updated_at: masterItems.updated_at,
        category_name: categories.name,
      })
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.id, updatedItem.id))
      .get();

    if (!result) {
      return errorResponse('Failed to fetch updated item', 500);
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, 'update master item (PUT)');
  }
};

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
