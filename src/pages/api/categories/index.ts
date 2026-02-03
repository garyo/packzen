export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, count } from 'drizzle-orm';
import { categories } from '../../../../db/schema';
import { categoryCreateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  getDatabaseConnection,
  getUserId,
  getBillingStatus,
  errorResponse,
  successResponse,
  handleApiError,
} from '../../../lib/api-helpers';
import { checkCategoryLimit } from '../../../lib/resource-limits';
import { logChange, getSourceId } from '../../../lib/sync';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db.select().from(categories).where(eq(categories.clerk_user_id, userId)).all();
}, 'fetch categories');

export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const billingStatus = getBillingStatus(context.locals);

    // Validate request body
    const body = await context.request.json();
    const validation = validateRequestSafe(categoryCreateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    // Check resource limit
    const [{ categoryCount }] = await db
      .select({ categoryCount: count() })
      .from(categories)
      .where(eq(categories.clerk_user_id, userId));

    const limitCheck = checkCategoryLimit(categoryCount, billingStatus);
    if (!limitCheck.allowed) {
      return errorResponse(limitCheck.message!, 403);
    }

    const { name, icon, sort_order } = validation.data;

    const newCategory = await db
      .insert(categories)
      .values({
        clerk_user_id: userId,
        name,
        icon: icon || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();

    const sourceId = getSourceId(context.request);
    logChange(db, userId, 'category', newCategory.id, null, 'create', newCategory, sourceId).catch(
      () => {}
    );
    return successResponse(newCategory, 201);
  } catch (error) {
    return handleApiError(error, 'create category');
  }
};
