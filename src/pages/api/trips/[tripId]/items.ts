export const prerender = false;

import type { APIContext, APIRoute } from 'astro';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { tripItems, bags, masterItems, type Trip } from '../../../../../db/schema';
import {
  tripItemCreateSchema,
  tripItemBatchCreateSchema,
  tripItemUpdateSchema,
  MAX_QUANTITY,
  type TripItemCreate,
} from '../../../../lib/validation';
import {
  createGetHandler,
  createPatchHandler,
  createDeleteHandler,
  getDatabaseConnection,
  getUserId,
  successResponse,
  errorToResponse,
  readJsonBody,
  parseWith,
  requireOwnedTrip,
  enforceLimit,
  BadRequestError,
  ForbiddenError,
  type SyncConfig,
} from '../../../../lib/api-helpers';
import { planLimit, limitMessage } from '../../../../lib/resource-limits';
import { chunkRowsForInsert, selectByIds } from '../../../../lib/d1';
import { logChange, logChanges, getSourceId } from '../../../../lib/sync';
import { logEvent } from '../../../../lib/analytics';

const sync: SyncConfig = {
  entityType: 'tripItem',
  parentId: (params) => params.tripId,
};

const itemDeleteSchema = z.object({ id: z.string().uuid() });

type ItemRefs = {
  bag_id?: string | null;
  container_item_id?: string | null;
  master_item_id?: string | null;
  is_container?: boolean | null;
};

/**
 * Verify that bag_id, container_item_id, and master_item_id references on one
 * or more trip items actually belong to this trip/user, with one query per
 * reference type across the whole batch.
 */
async function validateItemRefs(
  db: DrizzleD1Database,
  userId: string,
  tripId: string,
  items: ItemRefs[]
): Promise<void> {
  const uniqueIds = (values: (string | null | undefined)[]) => [
    ...new Set(values.filter((id): id is string => !!id)),
  ];

  const bagIds = uniqueIds(items.map((i) => i.bag_id));
  const ownedBags = await selectByIds(bagIds, 1, (ids) =>
    db
      .select({ id: bags.id })
      .from(bags)
      .where(and(inArray(bags.id, ids), eq(bags.trip_id, tripId)))
      .all()
  );
  if (ownedBags.length !== bagIds.length) {
    throw new BadRequestError('Bag not found or does not belong to this trip');
  }

  const containerIds = uniqueIds(items.map((i) => i.container_item_id));
  const containers = await selectByIds(containerIds, 1, (ids) =>
    db
      .select({ id: tripItems.id, is_container: tripItems.is_container })
      .from(tripItems)
      .where(and(inArray(tripItems.id, ids), eq(tripItems.trip_id, tripId)))
      .all()
  );
  if (containers.length !== containerIds.length) {
    throw new BadRequestError('Container item not found or does not belong to this trip');
  }
  if (containers.some((c) => !c.is_container)) {
    throw new BadRequestError('Cannot add item to a non-container item');
  }
  if (items.some((i) => i.container_item_id && i.is_container)) {
    throw new BadRequestError('Containers cannot be nested inside other containers');
  }

  const masterItemIds = uniqueIds(items.map((i) => i.master_item_id));
  const ownedMasterItems = await selectByIds(masterItemIds, 1, (ids) =>
    db
      .select({ id: masterItems.id })
      .from(masterItems)
      .where(and(inArray(masterItems.id, ids), eq(masterItems.clerk_user_id, userId)))
      .all()
  );
  if (ownedMasterItems.length !== masterItemIds.length) {
    throw new BadRequestError('Master item not found or does not belong to you');
  }
}

function newItemRow(tripId: string, item: TripItemCreate): typeof tripItems.$inferInsert {
  return {
    trip_id: tripId,
    name: item.name,
    category_name: item.category_name || null,
    quantity: item.quantity,
    bag_id: item.bag_id || null,
    master_item_id: item.master_item_id || null,
    container_item_id: item.container_item_id || null,
    is_container: item.is_container,
    // An item is never both packed and skipped; skipping wins.
    is_packed: item.is_packed && !item.is_skipped,
    is_skipped: item.is_skipped,
    notes: item.notes || null,
  };
}

export const GET: APIRoute = createGetHandler(async ({ db, userId, params }) => {
  const trip = await requireOwnedTrip(db, userId, params.tripId);
  return await db
    .select()
    .from(tripItems)
    .where(eq(tripItems.trip_id, trip.id))
    .orderBy(asc(tripItems.name))
    .all();
}, 'fetch trip items');

/**
 * Add one item, or many with `{ items: [...] }` (e.g. a one-tap starter list).
 */
export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);
    const trip = await requireOwnedTrip(db, userId, context.params.tripId!);
    const body = await readJsonBody(context.request);

    const isBatch =
      !!body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items);
    return isBatch
      ? await createItems(context, db, userId, trip, body)
      : await createItem(context, db, userId, trip, body);
  } catch (error) {
    return errorToResponse(error, 'create trip item');
  }
};

async function createItem(
  context: APIContext,
  db: DrizzleD1Database,
  userId: string,
  trip: Trip,
  body: unknown
): Promise<Response> {
  const item = parseWith(tripItemCreateSchema, body);
  const { name, category_name, quantity, bag_id, container_item_id } = item;
  const sourceId = getSourceId(context.request);

  // The same name and category in the same place adds to that item's
  // quantity instead of creating a second row.
  const duplicate = item.merge_duplicates
    ? await db
        .select()
        .from(tripItems)
        .where(
          and(
            eq(tripItems.trip_id, trip.id),
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
    : undefined;

  if (duplicate) {
    const merged = await db
      .update(tripItems)
      .set({
        quantity: Math.min(duplicate.quantity + quantity, MAX_QUANTITY),
        updated_at: new Date(),
      })
      .where(eq(tripItems.id, duplicate.id))
      .returning()
      .get();

    logChange(
      db,
      userId,
      {
        entityType: 'tripItem',
        entityId: merged.id,
        parentId: trip.id,
        action: 'update',
        data: merged,
      },
      sourceId
    );
    return successResponse(merged, 200);
  }

  const count = await db.$count(tripItems, eq(tripItems.trip_id, trip.id));
  await enforceLimit(context.locals, 'maxItemsPerTrip', count + 1);
  await validateItemRefs(db, userId, trip.id, [item]);

  const newItem = await db.insert(tripItems).values(newItemRow(trip.id, item)).returning().get();

  logChange(
    db,
    userId,
    {
      entityType: 'tripItem',
      entityId: newItem.id,
      parentId: trip.id,
      action: 'create',
      data: newItem,
    },
    sourceId
  );
  logEvent(db, 'items_added', { userId, props: { tripId: trip.id, count: 1, source: 'single' } });
  return successResponse(newItem, 201);
}

/**
 * Batch create: dedups by name (case-insensitive) against existing items and
 * within the batch, inserts as many as fit under the plan's item limit in one
 * atomic D1 batch, and logs a sync event per row so batched items are
 * indistinguishable from individually-added ones.
 */
async function createItems(
  context: APIContext,
  db: DrizzleD1Database,
  userId: string,
  trip: Trip,
  body: unknown
): Promise<Response> {
  const { items } = parseWith(tripItemBatchCreateSchema, body);

  const existing = await db
    .select({ name: tripItems.name })
    .from(tripItems)
    .where(eq(tripItems.trip_id, trip.id))
    .all();

  const seenNames = new Set(existing.map((i) => i.name.toLowerCase()));
  const rows: (typeof tripItems.$inferInsert)[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    rows.push(newItemRow(trip.id, item));
  }

  if (rows.length === 0) {
    return successResponse([], 200);
  }

  const max = await planLimit(
    context.locals.billing,
    'maxItemsPerTrip',
    existing.length + rows.length
  );
  const toInsert = rows.slice(0, Math.max(0, max - existing.length));
  if (toInsert.length === 0) {
    throw new ForbiddenError(limitMessage('maxItemsPerTrip', max));
  }

  await validateItemRefs(db, userId, trip.id, toInsert);

  const [first, ...rest] = chunkRowsForInsert(tripItems, toInsert).map((chunk) =>
    db.insert(tripItems).values(chunk).returning()
  );
  const inserted = (await db.batch([first, ...rest])).flat();

  logChanges(
    db,
    userId,
    inserted.map((row) => ({
      entityType: 'tripItem',
      entityId: row.id,
      parentId: trip.id,
      action: 'create' as const,
      data: row,
    })),
    getSourceId(context.request)
  );
  logEvent(db, 'items_added', {
    userId,
    props: { tripId: trip.id, count: inserted.length, source: 'batch' },
  });

  return successResponse(inserted, 201);
}

export const PATCH: APIRoute = createPatchHandler(
  async ({ db, userId, validatedData, params }) => {
    const trip = await requireOwnedTrip(db, userId, params.tripId);
    const {
      id,
      bag_id,
      container_item_id,
      master_item_id,
      is_container,
      is_packed,
      is_skipped,
      ...fields
    } = validatedData;

    const item = await db
      .select()
      .from(tripItems)
      .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, trip.id)))
      .get();
    if (!item) return undefined;

    if (bag_id) {
      const bag = await db
        .select({ id: bags.id })
        .from(bags)
        .where(and(eq(bags.id, bag_id), eq(bags.trip_id, trip.id)))
        .get();
      if (!bag) throw new BadRequestError('Bag not found or does not belong to this trip');
    }

    if (master_item_id) {
      const owned = await db
        .select({ id: masterItems.id })
        .from(masterItems)
        .where(and(eq(masterItems.id, master_item_id), eq(masterItems.clerk_user_id, userId)))
        .get();
      if (!owned) throw new BadRequestError('Master item not found or does not belong to you');
    }

    if (container_item_id) {
      if (container_item_id === id) {
        throw new BadRequestError('Item cannot be placed inside itself');
      }
      const container = await db
        .select({ is_container: tripItems.is_container })
        .from(tripItems)
        .where(and(eq(tripItems.id, container_item_id), eq(tripItems.trip_id, trip.id)))
        .get();
      if (!container) {
        throw new BadRequestError('Container item not found or does not belong to this trip');
      }
      if (!container.is_container) {
        throw new BadRequestError('Cannot add item to a non-container item');
      }
      if (is_container ?? item.is_container) {
        throw new BadRequestError('Containers cannot be nested inside other containers');
      }
    }

    if (is_container === true && item.container_item_id && container_item_id !== null) {
      throw new BadRequestError(
        'Cannot make an item a container while it is inside another container'
      );
    }

    // Un-flagging a container that still holds items would strand them: the
    // delete cascade only removes children while is_container is true.
    // Callers must move or delete the children first.
    if (is_container === false && item.is_container) {
      const childCount = await db.$count(
        tripItems,
        and(eq(tripItems.container_item_id, id), eq(tripItems.trip_id, trip.id))
      );
      if (childCount > 0) {
        throw new BadRequestError(
          'Cannot remove container status while it still contains items. Move or delete the contained items first.'
        );
      }
    }

    // An item is unpacked, packed or skipped — never both packed and skipped.
    // Setting one clears the other; skipping wins a patch that sets both.
    const packState = is_skipped
      ? { is_skipped: true, is_packed: false }
      : is_packed
        ? { is_packed: true, is_skipped: false }
        : { is_packed, is_skipped };

    // Drizzle leaves out undefined fields, so only the fields sent are updated.
    const updated = await db
      .update(tripItems)
      .set({
        ...fields,
        ...packState,
        bag_id,
        container_item_id,
        master_item_id,
        is_container,
        updated_at: new Date(),
      })
      .where(eq(tripItems.id, item.id))
      .returning()
      .get();

    if (packState.is_packed) {
      logEvent(db, 'item_packed', { userId, props: { tripId: trip.id } });
    }
    return updated;
  },
  'update trip item',
  tripItemUpdateSchema,
  sync
);

export const DELETE: APIRoute = createDeleteHandler(
  async ({ db, userId, params, request }) => {
    const { id } = parseWith(itemDeleteSchema, await readJsonBody(request));
    const trip = await requireOwnedTrip(db, userId, params.tripId);

    // A container takes its contents with it (atomically); each child gets its
    // own sync event, and the wrapper logs the item itself.
    const [children, deleted] = await db.batch([
      db
        .delete(tripItems)
        .where(and(eq(tripItems.container_item_id, id), eq(tripItems.trip_id, trip.id)))
        .returning({ id: tripItems.id }),
      db
        .delete(tripItems)
        .where(and(eq(tripItems.id, id), eq(tripItems.trip_id, trip.id)))
        .returning({ id: tripItems.id }),
    ]);
    if (deleted.length === 0) return false;

    logChanges(
      db,
      userId,
      children.map((child) => ({
        entityType: 'tripItem',
        entityId: child.id,
        parentId: trip.id,
        action: 'delete' as const,
        data: null,
      })),
      getSourceId(request)
    );
    return id;
  },
  'delete trip item',
  sync
);
