export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, asc, count } from 'drizzle-orm';
import { bagTemplates } from '../../../../db/schema';
import { bagTemplateCreateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  getDatabaseConnection,
  getUserId,
  getBillingStatus,
  errorResponse,
  successResponse,
  handleApiError,
} from '../../../lib/api-helpers';
import { checkBagTemplateLimit } from '../../../lib/resource-limits';
import { logChange, getSourceId } from '../../../lib/sync';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db
    .select()
    .from(bagTemplates)
    .where(eq(bagTemplates.clerk_user_id, userId))
    .orderBy(asc(bagTemplates.sort_order))
    .all();
}, 'fetch bag templates');

export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const billingStatus = getBillingStatus(context.locals);

    const body = await context.request.json();
    const validation = validateRequestSafe(bagTemplateCreateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    const [{ templateCount }] = await db
      .select({ templateCount: count() })
      .from(bagTemplates)
      .where(eq(bagTemplates.clerk_user_id, userId));

    const limitCheck = checkBagTemplateLimit(templateCount, billingStatus);
    if (!limitCheck.allowed) {
      return errorResponse(limitCheck.message!, 403);
    }

    const { name, type, color, sort_order } = validation.data;

    const newTemplate = await db
      .insert(bagTemplates)
      .values({
        clerk_user_id: userId,
        name,
        type,
        color: color || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();

    const sourceId = getSourceId(context.request);
    logChange(
      db,
      userId,
      'bagTemplate',
      newTemplate.id,
      null,
      'create',
      newTemplate,
      sourceId
    ).catch(() => {});
    return successResponse(newTemplate, 201);
  } catch (error) {
    return handleApiError(error, 'create bag template');
  }
};
