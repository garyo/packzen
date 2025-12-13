import type { APIRoute } from 'astro';
import { eq, and, asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { bags, trips } from '../../../../../db/schema';

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

    // Verify trip ownership
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

    const tripBags = await db
      .select()
      .from(bags)
      .where(eq(bags.trip_id, tripId))
      .orderBy(asc(bags.sort_order))
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
};

export const POST: APIRoute = async ({ request, locals, params }) => {
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

    // Verify trip ownership
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
        trip_id: tripId,
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

    // Verify trip ownership
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

    const body = await request.json();
    const { bag_id, name, type, color } = body;

    if (!bag_id) {
      return new Response(JSON.stringify({ error: 'Bag ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build update object dynamically based on what was provided
    type BagUpdate = Partial<Pick<typeof bags.$inferSelect, 'name' | 'type' | 'color'>>;
    const updates: BagUpdate = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (color !== undefined) updates.color = color;

    const updatedBag = await db
      .update(bags)
      .set(updates)
      .where(and(eq(bags.id, bag_id), eq(bags.trip_id, tripId)))
      .returning()
      .get();

    if (!updatedBag) {
      return new Response(JSON.stringify({ error: 'Bag not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updatedBag), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating bag:', error);
    return new Response(JSON.stringify({ error: 'Failed to update bag' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals, params }) => {
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
    const { bag_id } = body;

    if (!bag_id) {
      return new Response(JSON.stringify({ error: 'Bag ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify trip ownership
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

    const deleted = await db
      .delete(bags)
      .where(and(eq(bags.id, bag_id), eq(bags.trip_id, tripId)))
      .returning()
      .get();

    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Bag not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting bag:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete bag' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
