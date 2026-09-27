export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { bagTemplates } from '../../../../db/schema';
import { bagTemplateUpdateSchema } from '../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
  NotFoundError,
} from '../../../lib/api-helpers';

const sync = { entityType: 'bagTemplate' };

const ownedTemplate = (id: string, userId: string) =>
  and(eq(bagTemplates.id, id), eq(bagTemplates.clerk_user_id, userId));

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const template = await db
    .select()
    .from(bagTemplates)
    .where(ownedTemplate(params.id, userId))
    .get();
  if (!template) throw new NotFoundError('Template not found');
  return template;
}, 'fetch bag template');

export const PATCH: APIRoute = createPatchHandler(
  async ({ db, userId, validatedData, params }) => {
    const { name, type, color, sort_order } = validatedData;
    return await db
      .update(bagTemplates)
      .set({ name, type, color, sort_order, updated_at: new Date() })
      .where(ownedTemplate(params.id, userId))
      .returning()
      .get();
  },
  'update bag template',
  bagTemplateUpdateSchema,
  sync
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params }) => {
    const deleted = await db
      .delete(bagTemplates)
      .where(ownedTemplate(params.id, userId))
      .returning({ id: bagTemplates.id })
      .get();
    return deleted?.id ?? false;
  },
  'delete bag template',
  sync
);
