export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and, count } from 'drizzle-orm';
import { masterItems, categories } from '../../../../db/schema';
import { masterItemCreateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  getDatabaseConnection,
  getUserId,
  getBillingStatus,
  errorResponse,
  successResponse,
  handleApiError,
} from '../../../lib/api-helpers';
import { checkMasterItemLimit } from '../../../lib/resource-limits';
import { logChange, getSourceId } from '../../../lib/sync';

/** Shared select shape for master items joined with category name */
export const masterItemWithCategorySelect = {
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
} as const;

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db
    .select(masterItemWithCategorySelect)
    .from(masterItems)
    .leftJoin(categories, eq(masterItems.category_id, categories.id))
    .where(eq(masterItems.clerk_user_id, userId))
    .all();
}, 'fetch master items');

export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const billingStatus = getBillingStatus(context.locals);

    const body = await context.request.json();
    const validation = validateRequestSafe(masterItemCreateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    // Check resource limit
    const [{ itemCount }] = await db
      .select({ itemCount: count() })
      .from(masterItems)
      .where(eq(masterItems.clerk_user_id, userId));

    const limitCheck = checkMasterItemLimit(itemCount, billingStatus);
    if (!limitCheck.allowed) {
      return errorResponse(limitCheck.message!, 403);
    }

    const { name, description, category_id, default_quantity, is_container } = validation.data;

    // Verify category ownership if category_id is provided
    if (category_id) {
      const category = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, category_id), eq(categories.clerk_user_id, userId)))
        .get();

      if (!category) {
        return errorResponse('Category not found or does not belong to you', 400);
      }
    }

    const newItem = await db
      .insert(masterItems)
      .values({
        clerk_user_id: userId,
        name,
        description: description || null,
        category_id: category_id || null,
        default_quantity: default_quantity || 1,
        is_container: is_container || false,
      })
      .returning()
      .get();

    // Fetch the item with category name
    const result = await db
      .select(masterItemWithCategorySelect)
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.id, newItem.id))
      .get();

    if (!result) {
      return errorResponse('Failed to fetch created item', 500);
    }

    const sourceId = getSourceId(context.request);
    logChange(db, userId, 'masterItem', result.id, null, 'create', result, sourceId).catch(
      () => {}
    );
    return successResponse(result, 201);
  } catch (error) {
    return handleApiError(error, 'create master item');
  }
};
