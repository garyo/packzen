import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { trips } from '../../../../../db/schema';
import { tripUpdateSchema, validateRequestSafe } from '../../../../lib/validation';

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const { tripId } = params;

    if (!tripId) {
      return new Response(JSON.stringify({ error: 'Trip ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
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
};

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const { tripId } = params;

    if (!tripId) {
      return new Response(JSON.stringify({ error: 'Trip ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();

    // Validate and sanitize input
    const validation = validateRequestSafe(tripUpdateSchema, body);
    if (!validation.success) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { name, destination, start_date, end_date, notes } = validation.data;

    // Build update object dynamically based on what was provided
    type TripUpdate = Partial<Pick<typeof trips.$inferSelect, 'name' | 'destination' | 'start_date' | 'end_date' | 'notes'>>;
    const updates: TripUpdate & { updated_at: Date } = { updated_at: new Date() };
    if (name !== undefined) updates.name = name;
    if (destination !== undefined) updates.destination = destination;
    if (start_date !== undefined) updates.start_date = start_date;
    if (end_date !== undefined) updates.end_date = end_date;
    if (notes !== undefined) updates.notes = notes;

    const updated = await db
      .update(trips)
      .set(updates)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
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
};

export const PUT: APIRoute = async ({ request, locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const { tripId } = params;

    if (!tripId) {
      return new Response(JSON.stringify({ error: 'Trip ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
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
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  try {
    const runtime = locals.runtime as { env: { DB: D1Database } };
    const db = drizzle(runtime.env.DB);

    const userId = locals.userId;
    const { tripId } = params;

    if (!tripId) {
      return new Response(JSON.stringify({ error: 'Trip ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deleted = await db
      .delete(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
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
};
