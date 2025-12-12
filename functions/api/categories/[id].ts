import { eq, and } from 'drizzle-orm';
import { getDb, type Env } from '../../utils/db';
import { requireAuth } from '../../utils/auth';
import { categories } from '../../../db/schema';

export async function onRequestPut(context: {
  request: Request;
  env: Env;
  params: { id: string };
}): Promise<Response> {
  const { request, env, params } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const body = await request.json();
    const { name, icon, sort_order } = body;

    const updated = await db
      .update(categories)
      .set({ name, icon, sort_order })
      .where(and(eq(categories.id, params.id), eq(categories.clerk_user_id, auth.userId)))
      .returning()
      .get();

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updated), {
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
}

export async function onRequestDelete(context: {
  request: Request;
  env: Env;
  params: { id: string };
}): Promise<Response> {
  const { request, env, params } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const deleted = await db
      .delete(categories)
      .where(and(eq(categories.id, params.id), eq(categories.clerk_user_id, auth.userId)))
      .returning()
      .get();

    if (!deleted) {
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
}
