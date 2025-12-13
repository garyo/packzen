import type { APIRoute } from 'astro';
import { eq, and, asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { tripItems, trips } from '../../../../../db/schema';

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

    // Verify the trip belongs to the user
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

    const items = await db
      .select()
      .from(tripItems)
      .where(eq(tripItems.trip_id, tripId))
      .orderBy(asc(tripItems.name))
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

    // Verify the trip belongs to the user
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
        trip_id: tripId,
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

    // Verify the trip belongs to the user
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
    const { id, is_packed, quantity, bag_id, category_name, name } = body;

    // Build update object dynamically based on what was provided
    const updates: any = { updated_at: new Date() };
    if (is_packed !== undefined) updates.is_packed = is_packed;
    if (quantity !== undefined) updates.quantity = quantity;
    if (bag_id !== undefined) updates.bag_id = bag_id;
    if (category_name !== undefined) updates.category_name = category_name;
    if (name !== undefined) updates.name = name;

    const updated = await db
      .update(tripItems)
      .set(updates)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
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

    // Verify the trip belongs to the user
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
    const { id } = body;

    const deleted = await db
      .delete(tripItems)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
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
    console.error('Error deleting trip item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete trip item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
