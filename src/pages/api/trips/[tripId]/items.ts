export const prerender = false;

import type { APIRoute } from 'astro';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, asc, count, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { tripItems, trips, bags, masterItems } from '../../../../../db/schema';
import {
  tripItemCreateSchema,
  tripItemBatchCreateSchema,
  tripItemUpdateSchema,
  validateRequestSafe,
} from '../../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
  getDatabaseConnection,
  getUserId,
  getBillingStatus,
  errorResponse,
  successResponse,
  handleApiError,
  NotFoundError,
  BadRequestError,
  type SyncConfig,
} from '../../../../lib/api-helpers';
import { logChange, getSourceId } from '../../../../lib/sync';
import { logEvent } from '../../../../lib/analytics';
import { chunkArray } from '../../../../lib/utils';

const sync: SyncConfig = {
  entityType: 'tripItem',
  parentId: (params) => params.tripId || null,
};
import { checkTripItemLimit } from '../../../../lib/resource-limits';

// D1 caps bound variables at 100 per query and each trip-item row spans many
// columns, so batch inserts run in small chunks to stay well under the limit.
const CHUNK_SIZE = 6;

/**
 * Verify that bag_id, container_item_id, and master_item_id references on one
 * or more trip items actually belong to this trip/user. Runs one query per
 * reference type across the whole batch instead of N queries per item.
 * Returns an error message to surface to the client, or null if all refs check out.
 */
async function validateItemRefs(
  db: DrizzleD1Database,
  userId: string,
  tripId: string,
  items: Array<{
    bag_id?: string | null;
    container_item_id?: string | null;
    master_item_id?: string | null;
    is_container?: boolean | null;
  }>
): Promise<string | null> {
  const uniqueIds = (values: (string | null | undefined)[]) => [
    ...new Set(values.filter((id): id is string => !!id)),
  ];

  const bagIds = uniqueIds(items.map((i) => i.bag_id));
  if (bagIds.length > 0) {
    const ownedBags = await db
      .select({ id: bags.id })
      .from(bags)
      .where(and(inArray(bags.id, bagIds), eq(bags.trip_id, tripId)))
      .all();
    if (ownedBags.length !== bagIds.length) {
      return 'Bag not found or does not belong to this trip';
    }
  }

  const containerIds = uniqueIds(items.map((i) => i.container_item_id));
  if (containerIds.length > 0) {
    const containers = await db
      .select({ id: tripItems.id, is_container: tripItems.is_container })
      .from(tripItems)
      .where(and(inArray(tripItems.id, containerIds), eq(tripItems.trip_id, tripId)))
      .all();
    if (containers.length !== containerIds.length) {
      return 'Container item not found or does not belong to this trip';
    }
    if (containers.some((c) => !c.is_container)) {
      return 'Cannot add item to a non-container item';
    }
  }

  // Containers cannot be nested inside other containers
  if (items.some((i) => i.container_item_id && i.is_container)) {
    return 'Containers cannot be nested inside other containers';
  }

  const masterItemIds = uniqueIds(items.map((i) => i.master_item_id));
  if (masterItemIds.length > 0) {
    const ownedMasterItems = await db
      .select({ id: masterItems.id })
      .from(masterItems)
      .where(and(inArray(masterItems.id, masterItemIds), eq(masterItems.clerk_user_id, userId)))
      .all();
    if (ownedMasterItems.length !== masterItemIds.length) {
      return 'Master item not found or does not belong to you';
    }
  }

  return null;
}

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const { tripId } = params;
  if (!tripId) {
    throw new Error('Trip ID is required');
  }

  // Verify trip ownership
  const trip = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
    .get();

  if (!trip) {
    throw new NotFoundError('Trip not found');
  }

  return await db
    .select()
    .from(tripItems)
    .where(eq(tripItems.trip_id, tripId))
    .orderBy(asc(tripItems.name))
    .all();
}, 'fetch trip items');

export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const billingStatus = getBillingStatus(context.locals);

    const { tripId } = context.params;
    if (!tripId) {
      return errorResponse('Trip ID is required', 400);
    }

    // Validate request body
    const body = await context.request.json();

    // Batch path: `{ items: [...] }` adds many items in one request (starter lists).
    if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
      return await handleBatchCreate(context, db, userId, billingStatus, tripId, body);
    }

    const validation = validateRequestSafe(tripItemCreateSchema, body);
    if (!validation.success) {
      return errorResponse(validation.error, 400);
    }

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      return errorResponse('Trip not found', 404);
    }

    // Check resource limit
    const [{ itemCount }] = await db
      .select({ itemCount: count() })
      .from(tripItems)
      .where(eq(tripItems.trip_id, tripId));

    const limitCheck = checkTripItemLimit(itemCount, billingStatus);
    if (!limitCheck.allowed) {
      return errorResponse(limitCheck.message!, 403);
    }

    const {
      name,
      category_name,
      quantity,
      bag_id,
      master_item_id,
      container_item_id,
      is_container,
      notes,
      is_packed,
      is_skipped,
    } = validation.data;
    const { merge_duplicates } = validation.data;

    // Check if an item with the same name and category already exists (targeted query)
    const duplicateItem =
      merge_duplicates !== false
        ? await db
            .select()
            .from(tripItems)
            .where(
              and(
                eq(tripItems.trip_id, tripId),
                sql`lower(${tripItems.name}) = lower(${name})`,
                category_name
                  ? sql`lower(${tripItems.category_name}) = lower(${category_name})`
                  : sql`${tripItems.category_name} is null`,
                bag_id ? eq(tripItems.bag_id, bag_id) : sql`${tripItems.bag_id} is null`,
                container_item_id
                  ? eq(tripItems.container_item_id, container_item_id)
                  : sql`${tripItems.container_item_id} is null`
              )
            )
            .get()
        : null;

    // If duplicate exists, increment its quantity instead of creating a new item
    if (duplicateItem) {
      const updatedItem = await db
        .update(tripItems)
        .set({
          quantity: duplicateItem.quantity + (quantity || 1),
          updated_at: new Date(),
        })
        .where(eq(tripItems.id, duplicateItem.id))
        .returning()
        .get();

      const sourceId = getSourceId(context.request);
      logChange(db, userId, 'tripItem', updatedItem.id, tripId, 'update', updatedItem, sourceId);
      return successResponse(updatedItem, 200);
    }

    // Verify bag/container/master-item ownership before inserting
    const refError = await validateItemRefs(db, userId, tripId, [
      { bag_id, container_item_id, master_item_id, is_container },
    ]);
    if (refError) {
      return errorResponse(refError, 400);
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
        container_item_id: container_item_id || null,
        is_container: is_container || false,
        is_packed: is_packed ?? false,
        is_skipped: is_skipped ?? false,
        notes: notes || null,
      })
      .returning()
      .get();

    const sourceId = getSourceId(context.request);
    logChange(db, userId, 'tripItem', newItem.id, tripId, 'create', newItem, sourceId);
    void logEvent(db, 'items_added', { userId, props: { tripId, count: 1, source: 'single' } });
    return successResponse(newItem, 201);
  } catch (error) {
    return handleApiError(error, 'create trip item');
  }
};

/**
 * Add many trip items in one request (e.g. a one-tap starter list).
 * Inserts all rows in a single D1 operation, dedups by name (case-insensitive)
 * against existing items and within the batch, and logs a sync event per row so
 * batched items are indistinguishable from individually-added ones.
 */
async function handleBatchCreate(
  context: Parameters<APIRoute>[0],
  db: DrizzleD1Database,
  userId: string,
  billingStatus: Parameters<typeof checkTripItemLimit>[1],
  tripId: string,
  body: unknown
): Promise<Response> {
  const validation = validateRequestSafe(tripItemBatchCreateSchema, body);
  if (!validation.success) {
    return errorResponse(validation.error, 400);
  }

  // Verify trip ownership
  const trip = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
    .get();

  if (!trip) {
    return errorResponse('Trip not found', 404);
  }

  // Existing items: used both for the resource limit and for dedup.
  const existing = await db
    .select({ name: tripItems.name })
    .from(tripItems)
    .where(eq(tripItems.trip_id, tripId))
    .all();

  const limitCheck = checkTripItemLimit(existing.length, billingStatus);
  if (!limitCheck.allowed) {
    return errorResponse(limitCheck.message!, 403);
  }

  // Dedup case-insensitively against existing items and within the batch itself.
  const seenNames = new Set(existing.map((i) => i.name.toLowerCase()));
  const rows: (typeof tripItems.$inferInsert)[] = [];
  for (const item of validation.data.items) {
    const key = item.name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    rows.push({
      trip_id: tripId,
      name: item.name,
      category_name: item.category_name || null,
      quantity: item.quantity || 1,
      bag_id: item.bag_id || null,
      master_item_id: item.master_item_id || null,
      container_item_id: item.container_item_id || null,
      is_container: item.is_container || false,
      is_packed: item.is_packed ?? false,
      is_skipped: item.is_skipped ?? false,
      notes: item.notes || null,
    });
  }

  // Cap to the remaining room under the per-trip item limit.
  const room = limitCheck.maxAllowed - existing.length;
  const toInsert = rows.slice(0, room);

  if (toInsert.length === 0) {
    return successResponse([], 200);
  }

  // Verify bag/container/master-item ownership across the whole batch in one
  // query per reference type, rather than per-item.
  const refError = await validateItemRefs(db, userId, tripId, toInsert);
  if (refError) {
    return errorResponse(refError, 400);
  }

  const inserted: (typeof tripItems.$inferSelect)[] = [];
  for (const chunk of chunkArray(toInsert, CHUNK_SIZE)) {
    const rows = await db.insert(tripItems).values(chunk).returning().all();
    inserted.push(...rows);
  }

  const sourceId = getSourceId(context.request);
  for (const row of inserted) {
    logChange(db, userId, 'tripItem', row.id, tripId, 'create', row, sourceId);
  }

  void logEvent(db, 'items_added', {
    userId,
    props: { tripId, count: inserted.length, source: 'batch' },
  });

  return successResponse(inserted, 201);
}

export const PATCH: APIRoute = createPatchHandler<
  z.infer<typeof tripItemUpdateSchema>,
  typeof tripItems.$inferSelect
>(
  async ({ db, userId, validatedData, params }) => {
    const { tripId } = params;
    if (!tripId) {
      throw new Error('Trip ID is required');
    }

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      throw new NotFoundError('Trip not found');
    }

    const {
      id,
      is_packed,
      is_skipped,
      quantity,
      bag_id,
      category_name,
      name,
      container_item_id,
      is_container,
      notes,
    } = validatedData;

    // Verify bag ownership if bag_id is being updated
    if (bag_id !== undefined && bag_id !== null) {
      const bag = await db
        .select()
        .from(bags)
        .where(and(eq(bags.id, bag_id), eq(bags.trip_id, tripId)))
        .get();

      if (!bag) {
        throw new Error('Bag not found or does not belong to this trip');
      }
    }

    // Validate container assignment if container_item_id is being updated
    if (container_item_id !== undefined && container_item_id !== null) {
      // Can't assign item to itself
      if (container_item_id === id) {
        throw new Error('Item cannot be placed inside itself');
      }

      const containerItem = await db
        .select()
        .from(tripItems)
        .where(and(eq(tripItems.id, container_item_id), eq(tripItems.trip_id, tripId)))
        .get();

      if (!containerItem) {
        throw new Error('Container item not found or does not belong to this trip');
      }

      if (!containerItem.is_container) {
        throw new Error('Cannot add item to a non-container item');
      }

      // Get current item to check if it's a container
      const currentItem = await db
        .select()
        .from(tripItems)
        .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
        .get();

      // Containers cannot be nested inside other containers
      if (currentItem?.is_container || is_container) {
        throw new Error('Containers cannot be nested inside other containers');
      }
    }

    // If turning item into a container, ensure it's not inside another container
    if (is_container === true) {
      const currentItem = await db
        .select()
        .from(tripItems)
        .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
        .get();

      if (currentItem?.container_item_id && container_item_id !== null) {
        throw new Error('Cannot make an item a container while it is inside another container');
      }
    }

    // Un-flagging a container that still holds items would let a later delete
    // orphan them: the delete cascade only re-parents/removes children when
    // is_container is true at delete time. Reject instead of silently
    // stranding children (they'd also lose the bag they inherited from the
    // container) — callers must move/delete the children first, same as the
    // existing "delete container" flow requires.
    if (is_container === false) {
      const [{ childCount }] = await db
        .select({ childCount: count() })
        .from(tripItems)
        .where(and(eq(tripItems.container_item_id, id), eq(tripItems.trip_id, tripId)));

      if (childCount > 0) {
        throw new BadRequestError(
          'Cannot remove container status while it still contains items. Move or delete the contained items first.'
        );
      }
    }

    // Build update object dynamically
    type TripItemUpdate = Partial<
      Pick<
        typeof tripItems.$inferSelect,
        | 'name'
        | 'category_name'
        | 'quantity'
        | 'bag_id'
        | 'is_packed'
        | 'is_skipped'
        | 'container_item_id'
        | 'is_container'
        | 'notes'
      >
    >;
    const updates: TripItemUpdate & { updated_at: Date } = { updated_at: new Date() };
    if (is_packed !== undefined) updates.is_packed = is_packed;
    if (is_skipped !== undefined) updates.is_skipped = is_skipped;
    if (quantity !== undefined) updates.quantity = quantity;
    if (bag_id !== undefined) updates.bag_id = bag_id;
    if (category_name !== undefined) updates.category_name = category_name;
    if (name !== undefined) updates.name = name;
    if (container_item_id !== undefined) updates.container_item_id = container_item_id;
    if (is_container !== undefined) updates.is_container = is_container;
    if (notes !== undefined) updates.notes = notes;

    const updated = await db
      .update(tripItems)
      .set(updates)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
      .returning()
      .get();

    // Funnel event: item being marked packed.
    if (is_packed === true) {
      void logEvent(db, 'item_packed', { userId, props: { tripId } });
    }

    return updated;
  },
  'update trip item',
  (data) => validateRequestSafe(tripItemUpdateSchema, data),
  sync
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params, request }) => {
    const { tripId } = params;
    if (!tripId) {
      return false;
    }

    const body = await request.json();
    const id =
      typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
        ? body.id
        : null;

    if (!id) {
      return false;
    }

    // Verify trip ownership
    const trip = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
      .get();

    if (!trip) {
      return false;
    }

    // Look up the item first so we know whether it's a container that needs to
    // cascade-delete its children (otherwise the children become orphaned rows
    // pointing at a deleted container, which the list views hide but the header
    // still counts).
    const item = await db
      .select()
      .from(tripItems)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
      .get();

    if (!item) {
      return false;
    }

    if (item.is_container) {
      // Find children so we can both delete them and emit per-child sync events.
      const children = await db
        .select({ id: tripItems.id })
        .from(tripItems)
        .where(and(eq(tripItems.container_item_id, id), eq(tripItems.trip_id, tripId)))
        .all();

      if (children.length > 0) {
        await db
          .delete(tripItems)
          .where(and(eq(tripItems.container_item_id, id), eq(tripItems.trip_id, tripId)))
          .run();

        const sourceId = getSourceId(request);
        for (const child of children) {
          logChange(db, userId, 'tripItem', child.id, tripId, 'delete', null, sourceId);
        }
      }
    }

    const deleted = await db
      .delete(tripItems)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, tripId)))
      .returning()
      .get();

    return deleted ? id : false;
  },
  'delete trip item',
  sync
);
