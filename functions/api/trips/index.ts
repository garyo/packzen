import { eq } from 'drizzle-orm';
import { getDb, type Env } from '../../utils/db';
import { requireAuth } from '../../utils/auth';
import { trips } from '../../../db/schema';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const { auth } = authResult;
  const db = getDb(env);

  try {
    const userTrips = await db
      .select()
      .from(trips)
      .where(eq(trips.clerk_user_id, auth.userId))
      .orderBy(trips.start_date)
      .all();

    return new Response(JSON.stringify(userTrips), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch trips' }), {
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
    const { name, destination, start_date, end_date, notes } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const newTrip = await db
      .insert(trips)
      .values({
        clerk_user_id: auth.userId,
        name,
        destination: destination || null,
        start_date: start_date || null,
        end_date: end_date || null,
        notes: notes || null,
      })
      .returning()
      .get();

    return new Response(JSON.stringify(newTrip), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    return new Response(JSON.stringify({ error: 'Failed to create trip' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
