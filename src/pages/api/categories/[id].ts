import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { categories } from '../../../../db/schema';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const categoryId = params.id;

    if (!categoryId) {
      return new Response(JSON.stringify({ error: 'Category ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { name, icon } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updatedCategory = await db
      .update(categories)
      .set({
        name,
        icon: icon || null,
      })
      .where(and(eq(categories.id, categoryId), eq(categories.clerk_user_id, userId)))
      .returning()
      .get();

    if (!updatedCategory) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updatedCategory), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating category:', error);
    return new Response(JSON.stringify({ error: 'Failed to update category' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const categoryId = params.id;

    if (!categoryId) {
      return new Response(JSON.stringify({ error: 'Category ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deletedCategory = await db
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.clerk_user_id, userId)))
      .returning()
      .get();

    if (!deletedCategory) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete category' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
