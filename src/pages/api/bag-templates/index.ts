export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { bagTemplates } from '../../../../db/schema';
import { bagTemplateCreateSchema, validateRequestSafe } from '../../../lib/validation';
import { createGetHandler, createPostHandler } from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db
    .select()
    .from(bagTemplates)
    .where(eq(bagTemplates.clerk_user_id, userId))
    .orderBy(asc(bagTemplates.sort_order))
    .all();
}, 'fetch bag templates');

export const POST: APIRoute = createPostHandler<
  z.infer<typeof bagTemplateCreateSchema>,
  typeof bagTemplates.$inferSelect
>(
  async ({ db, userId, validatedData }) => {
    const { name, type, color, sort_order } = validatedData;

    return await db
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
  },
  'create bag template',
  (data) => validateRequestSafe(bagTemplateCreateSchema, data)
);
