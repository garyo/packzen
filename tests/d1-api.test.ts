import test from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import {
  analyticsEvents,
  bagTemplates,
  bags,
  categories,
  changeLog,
  masterItems,
  tripItems,
  trips,
} from '../db/schema';
import { fullBackupToYAML, yamlToFullBackup } from '../src/lib/yaml';
import { deleteAllUserData } from '../src/lib/user-data-cleanup';
import * as bagTemplatesApi from '../src/pages/api/bag-templates/index';
import * as tripsApiIndex from '../src/pages/api/trips/index';
import * as tripItemsApi from '../src/pages/api/trips/[tripId]/items';
import { getLimitsForPlan } from '../src/lib/resource-limits';
import {
  createTestDatabase,
  buildApiContext,
  seedUserData,
  loadSnapshot,
  summarizeSnapshot,
  importBackupForUser,
} from './test-helpers';

test('Full backup export/import round-trips data through YAML using a D1 database', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_backup_test';

  await seedUserData(db, userId);

  const snapshotBefore = await loadSnapshot(db, userId);
  const summaryBefore = summarizeSnapshot(snapshotBefore);

  const yaml = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  await deleteAllUserData(userId, db);

  const parsed = yamlToFullBackup(yaml);
  await importBackupForUser(db, userId, parsed);

  const snapshotAfter = await loadSnapshot(db, userId);
  const summaryAfter = summarizeSnapshot(snapshotAfter);

  assert.deepStrictEqual(summaryAfter, summaryBefore);
});

test('Malformed backup YAML is rejected before import', () => {
  const malformed = `
version: 2.0
categories: {}
trips: invalid
`;
  assert.throws(() => yamlToFullBackup(malformed), /Invalid backup/);
});

test('Bag template API enforces free-plan limits and allows standard plan', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_limit_test';

  // Seed up to limit - 1
  const limit = getLimitsForPlan({
    activePlan: 'free_user',
    hasFreeUserPlan: true,
    hasStandardPlan: false,
  }).maxBagTemplates;
  for (let i = 0; i < limit; i++) {
    await db.insert(bagTemplates).values({
      clerk_user_id: userId,
      name: `Template ${i + 1}`,
      type: 'carry_on',
      color: null,
      sort_order: i,
    });
  }

  const requestBody = {
    name: 'Extra Template',
    type: 'checked',
    color: '#ff0000',
  };

  const postRequest = new Request('http://localhost/api/bag-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const freeContext = buildApiContext({
    db: d1,
    userId,
    request: postRequest.clone() as unknown as Request,
  });
  const freeResponse = await bagTemplatesApi.POST!(freeContext);
  assert.equal(freeResponse.status, 403);

  const standardContext = buildApiContext({
    db: d1,
    userId,
    request: postRequest.clone() as unknown as Request,
    billingStatus: { activePlan: 'standard', hasFreeUserPlan: false, hasStandardPlan: true },
  });

  const standardResponse = await bagTemplatesApi.POST!(standardContext);
  assert.equal(standardResponse.status, 201);

  const templatesAfter = await db
    .select({ count: count() })
    .from(bagTemplates)
    .where(eq(bagTemplates.clerk_user_id, userId))
    .get();
  assert.equal(templatesAfter?.count, limit + 1);
});

test('Trip API enforces trip limits and returns stats', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'trip_test_user';
  const limit = getLimitsForPlan({
    activePlan: 'free_user',
    hasFreeUserPlan: true,
    hasStandardPlan: false,
  }).maxTrips;

  const createTripRequest = (name: string) =>
    new Request('http://localhost/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        destination: 'Test City',
        start_date: '2026-01-01',
        end_date: '2026-01-05',
      }),
    });

  for (let i = 0; i < limit; i++) {
    const ctx = buildApiContext({ db: d1, userId, request: createTripRequest(`Trip ${i + 1}`) });
    const response = await tripsApiIndex.POST!(ctx);
    assert.equal(response.status, 201);
  }

  const extraCtx = buildApiContext({ db: d1, userId, request: createTripRequest('Overflow Trip') });
  const extraResponse = await tripsApiIndex.POST!(extraCtx);
  assert.equal(extraResponse.status, 403);

  const getCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request('http://localhost/api/trips'),
  });
  const getResponse = await tripsApiIndex.GET!(getCtx);
  assert.equal(getResponse.status, 200);
  const tripsData = (await getResponse.json()) as Array<{ bag_count?: number }>;
  assert.equal(tripsData.length, limit);
  assert.ok(tripsData[0].bag_count !== undefined);
});

test('Trip creation normalizes reversed date ranges', async () => {
  const d1 = await createTestDatabase();
  const userId = 'normalize_create_user';

  const request = new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Out of Order',
      destination: 'Somewhere',
      start_date: '2026-05-10',
      end_date: '2026-05-01',
    }),
  });

  const ctx = buildApiContext({ db: d1, userId, request });
  const response = await tripsApiIndex.POST!(ctx);
  assert.equal(response.status, 201);
  const createdTrip = (await response.json()) as { start_date: string; end_date: string };
  assert.equal(createdTrip.start_date, '2026-05-01');
  assert.equal(createdTrip.end_date, '2026-05-10');
});

test('Trip updates reorder dates when only one boundary is provided', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'normalize_patch_user';

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'Reorder Trip',
      start_date: '2026-06-01',
      end_date: '2026-06-05',
    })
    .returning()
    .get();

  const patchRequest = new Request(`http://localhost/api/trips/${trip.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: '2026-07-10' }),
  });

  const patchCtx = buildApiContext({
    db: d1,
    userId,
    request: patchRequest,
    params: { tripId: trip.id },
  });

  const { PATCH } = await import('../src/pages/api/trips/[tripId]/index');
  const patchResponse = await PATCH!(patchCtx);
  assert.equal(patchResponse.status, 200);
  const updated = (await patchResponse.json()) as { start_date: string; end_date: string };
  assert.equal(updated.start_date, '2026-06-05');
  assert.equal(updated.end_date, '2026-07-10');
});

test('Trip items API merges duplicates by default but can be overridden', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'trip_items_user';

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'Merge Trip',
      destination: 'Anywhere',
      start_date: '2026-02-01',
      end_date: '2026-02-10',
    })
    .returning()
    .get();

  const bag = await db
    .insert(bags)
    .values({
      trip_id: trip.id,
      name: 'Carry-on',
      type: 'carry_on',
      color: null,
    })
    .returning()
    .get();

  const request = (body: Record<string, unknown>) =>
    new Request(`http://localhost/api/trips/${trip.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const basePayload = {
    name: 'Socks',
    category_name: 'Clothing',
    quantity: 1,
    bag_id: bag.id,
  };

  const firstCtx = buildApiContext({
    db: d1,
    userId,
    request: request(basePayload),
    params: { tripId: trip.id },
  });
  const firstResponse = await tripItemsApi.POST!(firstCtx);
  assert.equal(firstResponse.status, 201);
  const firstItem = (await firstResponse.json()) as { id: string; quantity: number };
  assert.equal(firstItem.quantity, 1);

  const secondCtx = buildApiContext({
    db: d1,
    userId,
    request: request({ ...basePayload, quantity: 2 }),
    params: { tripId: trip.id },
  });
  const secondResponse = await tripItemsApi.POST!(secondCtx);
  assert.equal(secondResponse.status, 200);
  const mergedItem = (await secondResponse.json()) as { id: string; quantity: number };
  assert.equal(mergedItem.quantity, 3);

  const thirdCtx = buildApiContext({
    db: d1,
    userId,
    request: request({ ...basePayload, merge_duplicates: false }),
    params: { tripId: trip.id },
  });
  const thirdResponse = await tripItemsApi.POST!(thirdCtx);
  assert.equal(thirdResponse.status, 201);
  const thirdItem = (await thirdResponse.json()) as { id: string };
  assert.notEqual(thirdItem.id, mergedItem.id);

  const items = await db.select().from(tripItems).where(eq(tripItems.trip_id, trip.id)).all();
  assert.equal(items.length, 2);
});

test('Deleting a trip removes its bags and items', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'trip_delete_user';

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'Delete Me',
      destination: 'Nowhere',
      start_date: '2026-03-01',
      end_date: '2026-03-05',
    })
    .returning()
    .get();

  const bag = await db
    .insert(bags)
    .values({
      trip_id: trip.id,
      name: 'Carry-on',
      type: 'carry_on',
    })
    .returning()
    .get();

  await db.insert(tripItems).values({
    trip_id: trip.id,
    bag_id: bag.id,
    name: 'Shoes',
    category_name: 'Clothing',
    quantity: 1,
  });

  const deleteRequest = new Request(`http://localhost/api/trips/${trip.id}`, { method: 'DELETE' });
  const deleteCtx = buildApiContext({
    db: d1,
    userId,
    request: deleteRequest,
    params: { tripId: trip.id },
  });
  const { DELETE } = await import('../src/pages/api/trips/[tripId]/index');
  const deleteResponse = await DELETE!(deleteCtx);
  assert.equal(deleteResponse.status, 200);
  const deleteResult = (await deleteResponse.json()) as { success: boolean };
  assert.equal(deleteResult.success, true);

  const remainingTrips = await db.select().from(trips).where(eq(trips.id, trip.id)).all();
  assert.equal(remainingTrips.length, 0);
  const remainingBags = await db.select().from(bags).where(eq(bags.trip_id, trip.id)).all();
  assert.equal(remainingBags.length, 0);
  const remainingItems = await db
    .select()
    .from(tripItems)
    .where(eq(tripItems.trip_id, trip.id))
    .all();
  assert.equal(remainingItems.length, 0);
});

test('deleteAllUserData removes all user artifacts', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'account_delete_user';

  const category = await db
    .insert(categories)
    .values({
      clerk_user_id: userId,
      name: 'Docs',
      icon: '📄',
      sort_order: 1,
    })
    .returning()
    .get();

  await db.insert(masterItems).values({
    clerk_user_id: userId,
    category_id: category.id,
    name: 'Passport',
  });

  await db.insert(bagTemplates).values({
    clerk_user_id: userId,
    name: 'Carry-on',
    type: 'carry_on',
  });

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'Account Trip',
    })
    .returning()
    .get();

  const bag = await db
    .insert(bags)
    .values({
      trip_id: trip.id,
      name: 'Carry-on',
      type: 'carry_on',
    })
    .returning()
    .get();

  await db.insert(tripItems).values({
    trip_id: trip.id,
    bag_id: bag.id,
    name: 'Shoes',
  });

  // B3: change_log (full entity JSON) and analytics_events (PII-keyed) must
  // also be purged on account deletion — a GDPR right-to-erasure gap.
  await db.insert(changeLog).values({
    clerk_user_id: userId,
    entity_type: 'trip',
    entity_id: trip.id,
    action: 'create',
    data: JSON.stringify({ name: 'Account Trip', destination: 'Secret Place' }),
    created_at: Math.floor(Date.now() / 1000),
  });

  await db.insert(analyticsEvents).values({
    clerk_user_id: userId,
    event: 'trip_created',
    props: JSON.stringify({ tripId: trip.id }),
  });

  await deleteAllUserData(userId, db);

  const remainingCounts = await Promise.all([
    db
      .select({ count: count() })
      .from(categories)
      .where(eq(categories.clerk_user_id, userId))
      .get(),
    db
      .select({ count: count() })
      .from(masterItems)
      .where(eq(masterItems.clerk_user_id, userId))
      .get(),
    db
      .select({ count: count() })
      .from(bagTemplates)
      .where(eq(bagTemplates.clerk_user_id, userId))
      .get(),
    db.select({ count: count() }).from(trips).where(eq(trips.clerk_user_id, userId)).get(),
    db.select({ count: count() }).from(bags).where(eq(bags.trip_id, trip.id)).get(),
    db.select({ count: count() }).from(tripItems).where(eq(tripItems.trip_id, trip.id)).get(),
    db.select({ count: count() }).from(changeLog).where(eq(changeLog.clerk_user_id, userId)).get(),
    db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.clerk_user_id, userId))
      .get(),
  ]);

  remainingCounts.forEach((row) => assert.equal(row?.count ?? 0, 0));
});

test('Deleting a container cascade-deletes its children', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'cascade_delete_user';

  const trip = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Cascade Trip' })
    .returning()
    .get();

  const container = await db
    .insert(tripItems)
    .values({ trip_id: trip.id, name: 'Toiletry Kit', is_container: true })
    .returning()
    .get();

  const child = await db
    .insert(tripItems)
    .values({ trip_id: trip.id, name: 'Toothbrush', container_item_id: container.id })
    .returning()
    .get();

  const unrelated = await db
    .insert(tripItems)
    .values({ trip_id: trip.id, name: 'Guidebook' })
    .returning()
    .get();

  const deleteCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/trips/${trip.id}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: container.id }),
    }),
    params: { tripId: trip.id },
  });

  const deleteResponse = await tripItemsApi.DELETE!(deleteCtx);
  assert.equal(deleteResponse.status, 200);

  const remaining = await db.select().from(tripItems).where(eq(tripItems.trip_id, trip.id)).all();
  const remainingIds = remaining.map((i) => i.id);
  assert.ok(!remainingIds.includes(container.id), 'container should be deleted');
  assert.ok(!remainingIds.includes(child.id), 'child should be cascade-deleted');
  assert.ok(remainingIds.includes(unrelated.id), 'unrelated item should remain');
});

test('Deleting a bag nulls its items bag_id instead of orphaning them', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'bag_delete_user';

  const trip = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Bag Trip' })
    .returning()
    .get();

  const bag = await db
    .insert(bags)
    .values({ trip_id: trip.id, name: 'Carry-on', type: 'carry_on' })
    .returning()
    .get();

  const item = await db
    .insert(tripItems)
    .values({ trip_id: trip.id, bag_id: bag.id, name: 'Socks' })
    .returning()
    .get();

  const deleteCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/trips/${trip.id}/bags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bag_id: bag.id }),
    }),
    params: { tripId: trip.id },
  });

  const { DELETE: BAGS_DELETE } = await import('../src/pages/api/trips/[tripId]/bags');
  const deleteResponse = await BAGS_DELETE!(deleteCtx);
  assert.equal(deleteResponse.status, 200);

  const remainingBags = await db.select().from(bags).where(eq(bags.id, bag.id)).all();
  assert.equal(remainingBags.length, 0, 'bag should be deleted');

  const updatedItem = await db.select().from(tripItems).where(eq(tripItems.id, item.id)).get();
  assert.ok(updatedItem, 'item should still exist');
  assert.equal(updatedItem!.bag_id, null, 'item bag_id should be nulled');
});

test('User isolation is enforced across trips, bags, and trip items', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const ownerId = 'owner_user';
  const otherId = 'other_user';

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: ownerId,
      name: 'Private Trip',
    })
    .returning()
    .get();

  const bag = await db
    .insert(bags)
    .values({
      trip_id: trip.id,
      name: 'Owner Bag',
      type: 'carry_on',
    })
    .returning()
    .get();

  await db.insert(tripItems).values({
    trip_id: trip.id,
    bag_id: bag.id,
    name: 'Secret Item',
  });

  const fetchTripCtx = buildApiContext({
    db: d1,
    userId: otherId,
    request: new Request(`http://localhost/api/trips/${trip.id}`),
    params: { tripId: trip.id },
  });
  // Ownership misses are "not found", not server errors (B7).
  const { GET: TRIP_GET } = await import('../src/pages/api/trips/[tripId]/index');
  const otherTripResponse = await TRIP_GET!(fetchTripCtx);
  assert.equal(otherTripResponse.status, 404);

  const bagGetCtx = buildApiContext({
    db: d1,
    userId: otherId,
    request: new Request(`http://localhost/api/trips/${trip.id}/bags`),
    params: { tripId: trip.id },
  });
  const { GET: BAGS_GET } = await import('../src/pages/api/trips/[tripId]/bags');
  const bagResponse = await BAGS_GET!(bagGetCtx);
  assert.equal(bagResponse.status, 404);

  const itemsGetCtx = buildApiContext({
    db: d1,
    userId: otherId,
    request: new Request(`http://localhost/api/trips/${trip.id}/items`),
    params: { tripId: trip.id },
  });
  const itemsResponse = await tripItemsApi.GET!(itemsGetCtx);
  assert.equal(itemsResponse.status, 404);
});

test('Trip copy respects the per-user trip limit (B1)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'copy_trip_limit_user';
  const limit = getLimitsForPlan({
    activePlan: 'free_user',
    hasFreeUserPlan: true,
    hasStandardPlan: false,
  }).maxTrips;

  let sourceTripId = '';
  for (let i = 0; i < limit; i++) {
    const trip = await db
      .insert(trips)
      .values({ clerk_user_id: userId, name: `Trip ${i + 1}` })
      .returning()
      .get();
    if (i === 0) sourceTripId = trip.id;
  }

  const { POST: COPY_POST } = await import('../src/pages/api/trips/[tripId]/copy');
  const copyCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/trips/${sourceTripId}/copy`, { method: 'POST' }),
    params: { tripId: sourceTripId },
  });
  const copyResponse = await COPY_POST!(copyCtx);
  assert.equal(copyResponse.status, 403);

  const tripCountAfter = await db
    .select({ count: count() })
    .from(trips)
    .where(eq(trips.clerk_user_id, userId))
    .get();
  assert.equal(tripCountAfter?.count, limit, 'no extra trip should have been created');
});

test('Trip copy respects the per-trip item limit (B1)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'copy_item_limit_user';
  const maxItems = getLimitsForPlan({
    activePlan: 'free_user',
    hasFreeUserPlan: true,
    hasStandardPlan: false,
  }).maxItemsPerTrip;

  const trip = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Big Trip' })
    .returning()
    .get();

  for (let i = 0; i < maxItems; i++) {
    await db.insert(tripItems).values({ trip_id: trip.id, name: `Item ${i + 1}` });
  }

  const { POST: COPY_POST } = await import('../src/pages/api/trips/[tripId]/copy');
  const copyCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/trips/${trip.id}/copy`, { method: 'POST' }),
    params: { tripId: trip.id },
  });
  const copyResponse = await COPY_POST!(copyCtx);
  assert.equal(copyResponse.status, 403);

  const tripCountAfter = await db
    .select({ count: count() })
    .from(trips)
    .where(eq(trips.clerk_user_id, userId))
    .get();
  assert.equal(tripCountAfter?.count, 1, 'no copy trip should have been created');
});

test('Trip copy duplicates bags, items, and container relationships in one atomic batch (B2)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'copy_happy_user';

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'Original Trip',
      destination: 'Lisbon',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    })
    .returning()
    .get();

  const bag = await db
    .insert(bags)
    .values({ trip_id: trip.id, name: 'Carry-on', type: 'carry_on', sort_order: 1 })
    .returning()
    .get();

  const container = await db
    .insert(tripItems)
    .values({
      trip_id: trip.id,
      bag_id: bag.id,
      name: 'Toiletry Kit',
      is_container: true,
      is_packed: true,
    })
    .returning()
    .get();

  await db.insert(tripItems).values({
    trip_id: trip.id,
    bag_id: bag.id,
    container_item_id: container.id,
    name: 'Toothbrush',
    is_packed: true,
  });

  const { POST: COPY_POST } = await import('../src/pages/api/trips/[tripId]/copy');
  const copyCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/trips/${trip.id}/copy`, { method: 'POST' }),
    params: { tripId: trip.id },
  });
  const copyResponse = await COPY_POST!(copyCtx);
  assert.equal(copyResponse.status, 201);
  const newTrip = (await copyResponse.json()) as { id: string; name: string };
  assert.equal(newTrip.name, 'Original Trip (Copy)');
  assert.notEqual(newTrip.id, trip.id);

  const newBags = await db.select().from(bags).where(eq(bags.trip_id, newTrip.id)).all();
  assert.equal(newBags.length, 1);

  const newItems = await db.select().from(tripItems).where(eq(tripItems.trip_id, newTrip.id)).all();
  assert.equal(newItems.length, 2);
  // Packed/skipped state resets on copy.
  assert.ok(newItems.every((item) => item.is_packed === false));

  const newContainer = newItems.find((item) => item.is_container);
  const newChild = newItems.find((item) => !item.is_container);
  assert.ok(newContainer && newChild, 'copy should include both the container and its child');
  assert.equal(newChild!.container_item_id, newContainer!.id);
  assert.equal(newChild!.bag_id, newBags[0].id);
});

test('A failed trip copy leaves no partial trip/bag/item rows (B2)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'copy_atomic_user';

  const trip = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Original Trip' })
    .returning()
    .get();
  const bag = await db
    .insert(bags)
    .values({ trip_id: trip.id, name: 'Carry-on', type: 'carry_on' })
    .returning()
    .get();
  await db.insert(tripItems).values({ trip_id: trip.id, bag_id: bag.id, name: 'Socks' });

  // Force the underlying D1 batch to fail right where the route handler
  // calls db.batch(), simulating a mid-copy failure (e.g. a transient D1
  // error). With the old sequential-insert implementation this would have
  // left a ghost trip/bag/item behind; the batched version must leave nothing.
  const originalBatch = d1.batch.bind(d1);
  (d1 as unknown as { batch: unknown }).batch = async () => {
    throw new Error('Simulated D1 batch failure');
  };

  try {
    const { POST: COPY_POST } = await import('../src/pages/api/trips/[tripId]/copy');
    const copyCtx = buildApiContext({
      db: d1,
      userId,
      request: new Request(`http://localhost/api/trips/${trip.id}/copy`, { method: 'POST' }),
      params: { tripId: trip.id },
    });
    const copyResponse = await COPY_POST!(copyCtx);
    assert.equal(copyResponse.status, 500);
  } finally {
    (d1 as unknown as { batch: unknown }).batch = originalBatch;
  }

  const allTrips = await db.select().from(trips).where(eq(trips.clerk_user_id, userId)).all();
  assert.equal(allTrips.length, 1, 'no ghost trip should remain after a failed copy');
  const allBags = await db.select().from(bags).all();
  assert.equal(allBags.length, 1, 'no ghost bag should remain after a failed copy');
});

test('Batch item create rejects a bag_id that belongs to another trip (B4)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'batch_ref_bag_user';

  const tripA = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Trip A' })
    .returning()
    .get();
  const tripB = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Trip B' })
    .returning()
    .get();

  const foreignBag = await db
    .insert(bags)
    .values({ trip_id: tripB.id, name: 'Trip B Bag', type: 'carry_on' })
    .returning()
    .get();

  const batchRequest = new Request(`http://localhost/api/trips/${tripA.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ name: 'Sunscreen', bag_id: foreignBag.id }] }),
  });

  const ctx = buildApiContext({
    db: d1,
    userId,
    request: batchRequest,
    params: { tripId: tripA.id },
  });
  const response = await tripItemsApi.POST!(ctx);
  assert.equal(response.status, 400);

  const items = await db.select().from(tripItems).where(eq(tripItems.trip_id, tripA.id)).all();
  assert.equal(items.length, 0, 'no item should be inserted when a bag reference is invalid');
});

test('Batch item create rejects a container_item_id that belongs to another trip (B4)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'batch_ref_container_user';

  const tripA = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Trip A' })
    .returning()
    .get();
  const tripB = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Trip B' })
    .returning()
    .get();

  const foreignContainer = await db
    .insert(tripItems)
    .values({ trip_id: tripB.id, name: 'Trip B Container', is_container: true })
    .returning()
    .get();

  const batchRequest = new Request(`http://localhost/api/trips/${tripA.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ name: 'Toothpaste', container_item_id: foreignContainer.id }],
    }),
  });

  const ctx = buildApiContext({
    db: d1,
    userId,
    request: batchRequest,
    params: { tripId: tripA.id },
  });
  const response = await tripItemsApi.POST!(ctx);
  assert.equal(response.status, 400);

  const items = await db.select().from(tripItems).where(eq(tripItems.trip_id, tripA.id)).all();
  assert.equal(items.length, 0, 'no item should be inserted when a container reference is invalid');
});

test('Empty PATCH body returns 400 instead of crashing (B8)', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'empty_patch_user';

  const trip = await db
    .insert(trips)
    .values({ clerk_user_id: userId, name: 'Patch Trip' })
    .returning()
    .get();
  const bag = await db
    .insert(bags)
    .values({ trip_id: trip.id, name: 'Carry-on', type: 'carry_on' })
    .returning()
    .get();
  const category = await db
    .insert(categories)
    .values({ clerk_user_id: userId, name: 'Docs' })
    .returning()
    .get();

  const { PATCH: BAGS_PATCH } = await import('../src/pages/api/trips/[tripId]/bags');
  const bagPatchCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/trips/${trip.id}/bags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bag_id: bag.id }),
    }),
    params: { tripId: trip.id },
  });
  const bagPatchResponse = await BAGS_PATCH!(bagPatchCtx);
  assert.equal(bagPatchResponse.status, 400);

  const { PATCH: CATEGORY_PATCH } = await import('../src/pages/api/categories/[id]');
  const categoryPatchCtx = buildApiContext({
    db: d1,
    userId,
    request: new Request(`http://localhost/api/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    params: { id: category.id },
  });
  const categoryPatchResponse = await CATEGORY_PATCH!(categoryPatchCtx);
  assert.equal(categoryPatchResponse.status, 400);
});
