import { eq, and } from 'drizzle-orm';
import { getDb, type Env } from '../../../utils/db';
import { requireAuth } from '../../../utils/auth';
import { tripItems, trips } from '../../../../db/schema';

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: { tripId: string };
}): Promise<Response> {
  const { request, env, params } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, params.tripId), eq(trips.clerk_user_id, auth.userId)))
      .get();

    if (!trip) {
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = await db
      .select()
      .from(tripItems)
      .where(eq(tripItems.trip_id, params.tripId))
      .orderBy(tripItems.name)
      .all();

    return new Response(JSON.stringify(items), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching trip items:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch trip items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  params: { tripId: string };
}): Promise<Response> {
  const { request, env, params } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, params.tripId), eq(trips.clerk_user_id, auth.userId)))
      .get();

    if (!trip) {
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { name, category_name, quantity, bag_id, master_item_id } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const newItem = await db
      .insert(tripItems)
      .values({
        trip_id: params.tripId,
        name,
        category_name: category_name || null,
        quantity: quantity || 1,
        bag_id: bag_id || null,
        master_item_id: master_item_id || null,
        is_packed: false,
      })
      .returning()
      .get();

    return new Response(JSON.stringify(newItem), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating trip item:', error);
    return new Response(JSON.stringify({ error: 'Failed to create trip item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPatch(context: {
  request: Request;
  env: Env;
  params: { tripId: string };
}): Promise<Response> {
  const { request, env, params } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, params.tripId), eq(trips.clerk_user_id, auth.userId)))
      .get();

    if (!trip) {
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { id, is_packed } = body;

    const updated = await db
      .update(tripItems)
      .set({ is_packed, updated_at: new Date() })
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, params.tripId)))
      .returning()
      .get();

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating trip item:', error);
    return new Response(JSON.stringify({ error: 'Failed to update trip item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
