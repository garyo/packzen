import type { APIRoute } from 'astro';
import { eq, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { trips } from '../../../../db/schema';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;

    const userTrips = await db
      .select()
      .from(trips)
      .where(eq(trips.clerk_user_id, userId))
      .orderBy(desc(trips.start_date))
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
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
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
        clerk_user_id: userId,
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
};
