import { eq } from 'drizzle-orm';
import { getDb, type Env } from '../../utils/db';
import { requireAuth } from '../../utils/auth';
import { categories } from '../../../db/schema';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  // Require authentication
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { auth } = authResult;
  const db = getDb(env);

  try {
    // Fetch user's categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.clerk_user_id, auth.userId))
      .orderBy(categories.sort_order, categories.name)
      .all();

    return new Response(JSON.stringify(userCategories), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch categories' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  // Require authentication
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const body = await request.json();
    const { name, icon, sort_order } = body;

    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Name is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const newCategory = await db
      .insert(categories)
      .values({
        clerk_user_id: auth.userId,
        name,
        icon: icon || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();

    return new Response(JSON.stringify(newCategory), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating category:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create category' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
