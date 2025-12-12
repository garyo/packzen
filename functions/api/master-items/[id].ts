import { eq, and } from 'drizzle-orm';
import { getDb, type Env } from '../../utils/db';
import { requireAuth } from '../../utils/auth';
import { masterItems } from '../../../db/schema';

export async function onRequestGet(context: {
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
    const item = await db
      .select()
      .from(masterItems)
      .where(and(eq(masterItems.id, params.id), eq(masterItems.clerk_user_id, auth.userId)))
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
}

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
      .where(and(eq(masterItems.id, params.id), eq(masterItems.clerk_user_id, auth.userId)))
      .returning()
      .get();

    if (!updatedItem) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updatedItem), {
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
      .delete(masterItems)
      .where(and(eq(masterItems.id, params.id), eq(masterItems.clerk_user_id, auth.userId)))
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
}
