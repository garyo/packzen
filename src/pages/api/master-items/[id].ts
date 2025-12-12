import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { masterItems, categories } from '../../../../db/schema';

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = 'temp-user-id'; // This should come from Clerk
    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Item ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const item = await db
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
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .get();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(item), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching master item:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch master item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ request, locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = 'temp-user-id'; // This should come from Clerk
    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Item ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { name, description, category_id, default_quantity } = body;

    const updatedItem = await db
      .update(masterItems)
      .set({
        name,
        description,
        category_id,
        default_quantity,
        updated_at: new Date(),
      })
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
      .where(eq(masterItems.id, updatedItem.id))
      .get();

    return new Response(JSON.stringify(itemWithCategory), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating master item:', error);
    return new Response(JSON.stringify({ error: 'Failed to update master item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = 'temp-user-id'; // This should come from Clerk
    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Item ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deleted = await db
      .delete(masterItems)
      .where(and(eq(masterItems.id, id), eq(masterItems.clerk_user_id, userId)))
      .returning()
      .get();

    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting master item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete master item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
