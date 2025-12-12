import { eq } from 'drizzle-orm';
import { getDb, type Env } from '../../utils/db';
import { requireAuth } from '../../utils/auth';
import { masterItems } from '../../../db/schema';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const items = await db
      .select()
      .from(masterItems)
      .where(eq(masterItems.clerk_user_id, auth.userId))
      .orderBy(masterItems.name)
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
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const body = await request.json();
    const { name, description, category_id, default_quantity } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const newItem = await db
      .insert(masterItems)
      .values({
        clerk_user_id: auth.userId,
        name,
        description: description || null,
        category_id: category_id || null,
        default_quantity: default_quantity || 1,
      })
      .returning()
      .get();

    return new Response(JSON.stringify(newItem), {
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
}
