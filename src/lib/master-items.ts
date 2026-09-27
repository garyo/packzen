/**
 * Server-side queries shared by the master-items API routes.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { categories, masterItems } from '../../db/schema';
import { BadRequestError } from './api-helpers';

/** Columns for a master item joined with its category name */
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
  // Aliased so the row never has two columns called "name".
  category_name: sql<string | null>`${categories.name}`.as('category_name'),
} as const;

/** The user's master item with its category name, or undefined */
export function fetchMasterItemWithCategory(db: DrizzleD1Database, userId: string, id: string) {
  return db
    .select(masterItemWithCategorySelect)
    .from(masterItems)
    .leftJoin(categories, eq(masterItems.category_id, categories.id))
    .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
    .get();
}

/** Reject a category_id that doesn't belong to the user */
export async function requireOwnedCategory(
  db: DrizzleD1Database,
  userId: string,
  categoryId: string
): Promise<void> {
  const category = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.clerk_user_id, userId)))
    .get();
  if (!category) {
    throw new BadRequestError('Category not found or does not belong to you');
  }
}
