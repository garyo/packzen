import { eq, and } from 'drizzle-orm';
import { getDb, type Env } from '../../../utils/db';
import { requireAuth } from '../../../utils/auth';
import { trips } from '../../../../db/schema';

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

    return new Response(JSON.stringify(trip), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching trip:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch trip' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPut(context: {
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
    const body = await request.json();
    const { name, destination, start_date, end_date, notes } = body;

    const updated = await db
      .update(trips)
      .set({
        name,
        destination,
        start_date,
        end_date,
        notes,
        updated_at: new Date(),
      })
      .where(and(eq(trips.id, params.tripId), eq(trips.clerk_user_id, auth.userId)))
      .returning()
      .get();

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    return new Response(JSON.stringify({ error: 'Failed to update trip' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestDelete(context: {
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
    const deleted = await db
      .delete(trips)
      .where(and(eq(trips.id, params.tripId), eq(trips.clerk_user_id, auth.userId)))
      .returning()
      .get();

    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Trip not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete trip' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
