import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { bagTemplates } from '../../../../db/schema';
import { bagTemplateUpdateSchema, validateRequestSafe } from '../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
} from '../../../lib/api-helpers';

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const { id } = params;
  if (!id) {
    throw new Error('Template ID is required');
  }

  const template = await db
    .select()
    .from(bagTemplates)
    .where(and(eq(bagTemplates.id, id), eq(bagTemplates.clerk_user_id, userId)))
    .get();

  if (!template) {
    throw new Error('Template not found');
  }

  return template;
}, 'fetch bag template');

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof bagTemplateUpdateSchema>,
  typeof bagTemplates.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const { id } = params;
    if (!id) {
      throw new Error('Template ID is required');
    }

    const { name, type, color, sort_order } = validatedData;

    // Build update object dynamically
    type TemplateUpdate = Partial<
      Pick<typeof bagTemplates.$inferSelect, 'name' | 'type' | 'color' | 'sort_order'>
    > & { updated_at: Date };
    const updates: TemplateUpdate = { updated_at: new Date() };
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (color !== undefined) updates.color = color;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    return await db
      .update(bagTemplates)
      .set(updates)
      .where(and(eq(bagTemplates.id, id), eq(bagTemplates.clerk_user_id, userId)))
      .returning()
      .get();
  },
  'update bag template',
  (data) => validateRequestSafe(bagTemplateUpdateSchema, data)
);

export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId, params }) => {
  const { id } = params;
  if (!id) return false;

  const deleted = await db
    .delete(bagTemplates)
    .where(and(eq(bagTemplates.id, id), eq(bagTemplates.clerk_user_id, userId)))
    .returning()
    .get();

  return !!deleted;
}, 'delete bag template');
