import test from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { bagTemplates, bags, categories, masterItems, tripItems, trips } from '../db/schema';
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
  ]);

  remainingCounts.forEach((row) => assert.equal(row?.count ?? 0, 0));
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
  const { GET: TRIP_GET } = await import('../src/pages/api/trips/[tripId]/index');
  const otherTripResponse = await TRIP_GET!(fetchTripCtx);
  assert.equal(otherTripResponse.status, 500);

  const bagGetCtx = buildApiContext({
    db: d1,
    userId: otherId,
    request: new Request(`http://localhost/api/trips/${trip.id}/bags`),
    params: { tripId: trip.id },
  });
  const { GET: BAGS_GET } = await import('../src/pages/api/trips/[tripId]/bags');
  const bagResponse = await BAGS_GET!(bagGetCtx);
  assert.equal(bagResponse.status, 500);

  const itemsGetCtx = buildApiContext({
    db: d1,
    userId: otherId,
    request: new Request(`http://localhost/api/trips/${trip.id}/items`),
    params: { tripId: trip.id },
  });
  const itemsResponse = await tripItemsApi.GET!(itemsGetCtx);
  assert.equal(itemsResponse.status, 500);
});
