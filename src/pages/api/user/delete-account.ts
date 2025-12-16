export const prerender = false;

import type { APIRoute } from 'astro';
import { createDeleteHandler } from '../../../lib/api-helpers';
import { deleteAllUserData } from '../../../lib/user-data-cleanup';

/**
 * DELETE /api/user/delete-account
 * Permanently deletes ALL user data (trips, items, categories, etc.)
 * This cannot be undone!
 */
export const DELETE: APIRoute = createDeleteHandler(async ({ db, userId }) => {
  await deleteAllUserData(userId, db);
  return true;
}, 'delete account data');
