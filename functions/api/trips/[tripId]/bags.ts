import { eq, and } from 'drizzle-orm';
import { getDb, type Env } from '../../../utils/db';
import { requireAuth } from '../../../utils/auth';
import { bags, trips } from '../../../../db/schema';

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
    // Verify trip ownership
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

    const tripBags = await db
      .select()
      .from(bags)
      .where(eq(bags.trip_id, params.tripId))
      .orderBy(bags.sort_order)
      .all();

    return new Response(JSON.stringify(tripBags), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching bags:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch bags' }), {
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
    const { name, type, color, sort_order } = body;

    if (!name || !type) {
      return new Response(JSON.stringify({ error: 'Name and type are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const newBag = await db
      .insert(bags)
      .values({
        trip_id: params.tripId,
        name,
        type,
        color: color || null,
        sort_order: sort_order || 0,
      })
      .returning()
      .get();

    return new Response(JSON.stringify(newBag), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating bag:', error);
    return new Response(JSON.stringify({ error: 'Failed to create bag' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
