import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { masterItems, categories } from '../../../../db/schema';
import { masterItemCreateSchema, validateRequestSafe } from '../../../lib/validation';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;

    const items = await db
      .select({
        id: masterItems.id,
        clerk_user_id: masterItems.clerk_user_id,
        category_id: masterItems.category_id,
        name: masterItems.name,
        description: masterItems.description,
        default_quantity: masterItems.default_quantity,
        created_at: masterItems.created_at,
        updated_at: masterItems.updated_at,
        category_name: categories.name,
      })
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.clerk_user_id, userId))
      .all();

    return new Response(JSON.stringify(items), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching master items:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch master items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const body = await request.json();

    // Validate and sanitize input
    const validation = validateRequestSafe(masterItemCreateSchema, body);
    if (!validation.success) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { name, description, category_id, default_quantity } = validation.data;

    const newItem = await db
      .insert(masterItems)
      .values({
        clerk_user_id: userId,
        name,
        description: description || null,
        category_id: category_id || null,
        default_quantity: default_quantity || 1,
      })
      .returning()
      .get();

    // Fetch the item with category name
    const itemWithCategory = await db
      .select({
        id: masterItems.id,
        clerk_user_id: masterItems.clerk_user_id,
        category_id: masterItems.category_id,
        name: masterItems.name,
        description: masterItems.description,
        default_quantity: masterItems.default_quantity,
        created_at: masterItems.created_at,
        updated_at: masterItems.updated_at,
        category_name: categories.name,
      })
      .from(masterItems)
      .leftJoin(categories, eq(masterItems.category_id, categories.id))
      .where(eq(masterItems.id, newItem.id))
      .get();

    return new Response(JSON.stringify(itemWithCategory), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating master item:', error);
    return new Response(JSON.stringify({ error: 'Failed to create master item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
