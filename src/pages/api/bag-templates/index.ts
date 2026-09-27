export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, asc } from 'drizzle-orm';
import { bagTemplates } from '../../../../db/schema';
import { bagTemplateCreateSchema } from '../../../lib/validation';
import { createGetHandler, createPostHandler, enforceLimit } from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
  return await db
    .select()
    .from(bagTemplates)
    .where(eq(bagTemplates.clerk_user_id, userId))
    .orderBy(asc(bagTemplates.sort_order))
    .all();
}, 'fetch bag templates');

export const POST: APIRoute = createPostHandler(
  async ({ db, userId, validatedData, locals }) => {
    const count = await db.$count(bagTemplates, eq(bagTemplates.clerk_user_id, userId));
    await enforceLimit(locals, 'maxBagTemplates', count + 1);

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
  bagTemplateCreateSchema,
  { entityType: 'bagTemplate' }
);
