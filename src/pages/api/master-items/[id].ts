export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
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
import { masterItemWithCategorySelect } from './index';

/** Fetch a master item with its category name by ID */
function fetchMasterItemWithCategory(db: DrizzleD1Database, itemId: string) {
  return db
    .select(masterItemWithCategorySelect)
    .from(masterItems)
    .leftJoin(categories, eq(masterItems.category_id, categories.id))
    .where(eq(masterItems.id, itemId))
    .get();
}

/** Verify that a category belongs to the user */
async function verifyCategoryOwnership(
  db: DrizzleD1Database,
  categoryId: string,
  userId: string
): Promise<Response | null> {
  const category = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.clerk_user_id, userId)))
    .get();

  if (!category) {
    return errorResponse('Category not found or does not belong to you', 400);
  }
  return null;
}

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const { id } = params;
  if (!id) {
    throw new Error('Item ID is required');
  }

  const item = await db
    .select(masterItemWithCategorySelect)
    .from(masterItems)
    .leftJoin(categories, eq(masterItems.category_id, categories.id))
    .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
    .get();

  if (!item) {
    throw new Error('Item not found');
  }

  return item;
}, 'fetch master item');

/**
 * Shared update logic for PATCH and PUT.
 * PATCH builds a partial update; PUT sets all fields.
 */
async function handleUpdate(context: Parameters<APIRoute>[0], partial: boolean): Promise<Response> {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);

    const { id } = context.params;
    if (!id) {
      return errorResponse('Item ID is required', 400);
    }

    const body = await context.request.json();
    const validation = validateRequestSafe(masterItemUpdateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const { name, description, category_id, default_quantity, is_container } = validation.data;

    // Verify category ownership if category_id is provided
    if (category_id !== undefined && category_id !== null) {
      const err = await verifyCategoryOwnership(db, category_id, userId);
      if (err) return err;
    }

    const setValues = partial
      ? {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(category_id !== undefined && { category_id }),
          ...(default_quantity !== undefined && { default_quantity }),
          ...(is_container !== undefined && { is_container }),
          updated_at: new Date(),
        }
      : { name, description, category_id, default_quantity, is_container, updated_at: new Date() };

    const updatedItem = await db
      .update(masterItems)
      .set(setValues)
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return errorResponse('Item not found', 404);
    }

    const result = await fetchMasterItemWithCategory(db, updatedItem.id);
    if (!result) {
      return errorResponse('Failed to fetch updated item', 500);
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, partial ? 'update master item' : 'update master item (PUT)');
  }
}

export const PATCH: APIRoute = async (context) => handleUpdate(context, true);

export const PUT: APIRoute = async (context) => handleUpdate(context, false);

export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId, params }) => {
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
