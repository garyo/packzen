import test from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { bags, categories, tripItems, trips } from '../db/schema';
import { tripToYAML, yamlToTrip, fullBackupToYAML, yamlToFullBackup } from '../src/lib/yaml';
import { deleteAllUserData } from '../src/lib/user-data-cleanup';
import { exportBackupData, restoreBackupData, restoreTripContents } from '../src/lib/backup';
import {
  createTestDatabase,
  seedUserData,
  loadSnapshot,
  summarizeSnapshot,
  importBackupForUser,
} from './test-helpers';
import { makeHandlerApi, type FailHook } from './handler-api';
import type { Trip, Bag, TripItem, Category, MasterItem, BagTemplate } from '../db/schema';

// ---------------------------------------------------------------------------
// Group 1: Pure YAML round-trip (no DB)
// ---------------------------------------------------------------------------

function makeTripFixture(): { trip: Trip; bags: Bag[]; items: TripItem[] } {
  const now = new Date();
  const tripId = crypto.randomUUID();
  const bagId = crypto.randomUUID();
  const containerId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  const looseId = crypto.randomUUID();

  const trip: Trip = {
    id: tripId,
    clerk_user_id: 'user_1',
    name: 'Beach Trip',
    destination: 'Hawaii',
    start_date: '2026-06-01',
    end_date: '2026-06-10',
    notes: 'Sunscreen!',
    created_at: now,
    updated_at: now,
  };

  const bagList: Bag[] = [
    {
      id: bagId,
      trip_id: tripId,
      name: 'Duffel',
      type: 'checked',
      color: '#ff0000',
      sort_order: 0,
      created_at: now,
    },
  ];

  const itemList: TripItem[] = [
    {
      id: containerId,
      trip_id: tripId,
      bag_id: bagId,
      master_item_id: null,
      container_item_id: null,
      is_container: true,
      name: 'Toiletry Kit',
      category_name: 'Toiletries',
      quantity: 1,
      is_packed: false,
      is_skipped: false,
      notes: 'Ziplock bag',
      created_at: now,
      updated_at: now,
    },
    {
      id: childId,
      trip_id: tripId,
      bag_id: bagId,
      master_item_id: null,
      container_item_id: containerId,
      is_container: false,
      name: 'Sunscreen',
      category_name: 'Toiletries',
      quantity: 2,
      is_packed: true,
      is_skipped: false,
      notes: 'SPF 50',
      created_at: now,
      updated_at: now,
    },
    {
      id: looseId,
      trip_id: tripId,
      bag_id: null,
      master_item_id: null,
      container_item_id: null,
      is_container: false,
      name: 'Sandals',
      category_name: 'Footwear',
      quantity: 1,
      is_packed: false,
      is_skipped: false,
      notes: null,
      created_at: now,
      updated_at: now,
    },
  ];

  return { trip, bags: bagList, items: itemList };
}

function makeFullBackupFixture(): {
  categories: Category[];
  masterItems: (MasterItem & { category_name: string | null })[];
  bagTemplates: BagTemplate[];
  trips: Array<{ trip: Trip; bags: Bag[]; items: TripItem[] }>;
} {
  const now = new Date();
  const catId = crypto.randomUUID();
  const masterId = crypto.randomUUID();
  const templateId = crypto.randomUUID();

  const categoriesList: Category[] = [
    {
      id: catId,
      clerk_user_id: 'user_1',
      name: 'Clothing',
      icon: '👕',
      sort_order: 0,
      created_at: now,
    },
  ];

  const masterItemsList: (MasterItem & { category_name: string | null })[] = [
    {
      id: masterId,
      clerk_user_id: 'user_1',
      name: 'T-Shirt',
      description: 'Cotton tee',
      category_id: catId,
      category_name: 'Clothing',
      default_quantity: 3,
      is_container: false,
      created_at: now,
      updated_at: now,
    },
  ];

  const bagTemplatesList: BagTemplate[] = [
    {
      id: templateId,
      clerk_user_id: 'user_1',
      name: 'Weekender',
      type: 'checked',
      color: '#00ff00',
      sort_order: 0,
      created_at: now,
      updated_at: now,
    },
  ];

  const { trip, bags: bagList, items } = makeTripFixture();

  return {
    categories: categoriesList,
    masterItems: masterItemsList,
    bagTemplates: bagTemplatesList,
    trips: [{ trip, bags: bagList, items }],
  };
}

test('Single trip round-trips through tripToYAML / yamlToTrip', () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const yamlStr = tripToYAML(trip, bagList, items);
  const parsed = yamlToTrip(yamlStr);

  assert.equal(parsed.trip.name, trip.name);
  assert.equal(parsed.trip.destination, trip.destination);
  assert.equal(parsed.trip.start_date, trip.start_date);
  assert.equal(parsed.trip.end_date, trip.end_date);
  assert.equal(parsed.trip.notes, trip.notes);
  assert.equal(parsed.bags.length, bagList.length);
  assert.equal(parsed.bags[0].name, 'Duffel');
  assert.equal(parsed.bags[0].type, 'checked');
  assert.equal(parsed.items.length, items.length);
});

test('Full backup round-trips through fullBackupToYAML / yamlToFullBackup', () => {
  const fixture = makeFullBackupFixture();
  const yamlStr = fullBackupToYAML(
    fixture.categories,
    fixture.masterItems,
    fixture.bagTemplates,
    fixture.trips
  );
  const parsed = yamlToFullBackup(yamlStr);

  assert.equal(parsed.version, '1.0');
  assert.equal(parsed.categories.length, 1);
  assert.equal(parsed.categories[0].name, 'Clothing');
  assert.equal(parsed.categories[0].icon, '👕');
  assert.equal(parsed.masterItems.length, 1);
  assert.equal(parsed.masterItems[0].name, 'T-Shirt');
  assert.equal(parsed.masterItems[0].default_quantity, 3);
  assert.equal(parsed.bagTemplates.length, 1);
  assert.equal(parsed.bagTemplates[0].name, 'Weekender');
  assert.equal(parsed.trips.length, 1);
  assert.equal(parsed.trips[0].name, 'Beach Trip');
  assert.equal(parsed.trips[0].items.length, 3);
});

test('Container references preserved through YAML round-trip', () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const yamlStr = tripToYAML(trip, bagList, items);
  const parsed = yamlToTrip(yamlStr);

  const container = parsed.items.find((i) => i.name === 'Toiletry Kit');
  const child = parsed.items.find((i) => i.name === 'Sunscreen');

  assert.ok(container);
  assert.equal(container.is_container, true);
  assert.ok(child);
  assert.equal(child.container_source_id, items[0].id);
  assert.equal(child.container_name, 'Toiletry Kit');
});

test('Bag references preserved through YAML round-trip', () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const yamlStr = tripToYAML(trip, bagList, items);
  const parsed = yamlToTrip(yamlStr);

  const duffelItem = parsed.items.find((i) => i.name === 'Toiletry Kit');
  assert.ok(duffelItem);
  assert.equal(duffelItem.bag_name, 'Duffel');
  assert.equal(duffelItem.bag_source_id, bagList[0].id);
});

test('Items without bags round-trip with null bag_name', () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const yamlStr = tripToYAML(trip, bagList, items);
  const parsed = yamlToTrip(yamlStr);

  const loose = parsed.items.find((i) => i.name === 'Sandals');
  assert.ok(loose);
  assert.equal(loose.bag_name, null);
  assert.equal(loose.bag_source_id, null);
});

test('Empty collections round-trip through full backup', () => {
  const yamlStr = fullBackupToYAML([], [], [], []);
  const parsed = yamlToFullBackup(yamlStr);

  assert.equal(parsed.categories.length, 0);
  assert.equal(parsed.masterItems.length, 0);
  assert.equal(parsed.bagTemplates.length, 0);
  assert.equal(parsed.trips.length, 0);
});

test('Hand-written YAML with unquoted dates imports them as date strings', () => {
  const parsed = yamlToTrip(
    'trip:\n  name: Beach Trip\n  start_date: 2026-06-01\n  end_date: 2026-06-07\n'
  );

  assert.equal(parsed.trip.start_date, '2026-06-01');
  assert.equal(parsed.trip.end_date, '2026-06-07');
});

test('Field fidelity: is_packed, is_container, notes, quantity preserved', () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const yamlStr = tripToYAML(trip, bagList, items);
  const parsed = yamlToTrip(yamlStr);

  const sunscreen = parsed.items.find((i) => i.name === 'Sunscreen')!;
  assert.equal(sunscreen.is_packed, true);
  assert.equal(sunscreen.quantity, 2);
  assert.equal(sunscreen.notes, 'SPF 50');
  assert.ok(!sunscreen.is_container, 'Sunscreen should not be a container');

  const kit = parsed.items.find((i) => i.name === 'Toiletry Kit')!;
  assert.equal(kit.is_packed, false);
  assert.equal(kit.is_container, true);
  assert.equal(kit.notes, 'Ziplock bag');
  assert.equal(kit.quantity, 1);

  const sandals = parsed.items.find((i) => i.name === 'Sandals')!;
  assert.equal(sandals.notes, null);
});

test('Multiple trips preserved independently in full backup', () => {
  const fixture = makeFullBackupFixture();
  const now = new Date();

  const trip2Id = crypto.randomUUID();
  const bag2Id = crypto.randomUUID();

  const trip2: Trip = {
    id: trip2Id,
    clerk_user_id: 'user_1',
    name: 'Mountain Hike',
    destination: 'Colorado',
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    notes: null,
    created_at: now,
    updated_at: now,
  };

  const bag2: Bag = {
    id: bag2Id,
    trip_id: trip2Id,
    name: 'Backpack',
    type: 'personal',
    color: '#00ff00',
    sort_order: 0,
    created_at: now,
  };

  const item2: TripItem = {
    id: crypto.randomUUID(),
    trip_id: trip2Id,
    bag_id: bag2Id,
    master_item_id: null,
    container_item_id: null,
    is_container: false,
    name: 'Hiking Boots',
    category_name: 'Footwear',
    quantity: 1,
    is_packed: false,
    is_skipped: false,
    notes: 'Waterproof',
    created_at: now,
    updated_at: now,
  };

  fixture.trips.push({ trip: trip2, bags: [bag2], items: [item2] });

  const yamlStr = fullBackupToYAML(
    fixture.categories,
    fixture.masterItems,
    fixture.bagTemplates,
    fixture.trips
  );
  const parsed = yamlToFullBackup(yamlStr);

  assert.equal(parsed.trips.length, 2);

  const beachTrip = parsed.trips.find((t) => t.name === 'Beach Trip');
  const hikeTrip = parsed.trips.find((t) => t.name === 'Mountain Hike');
  assert.ok(beachTrip);
  assert.ok(hikeTrip);
  assert.equal(beachTrip.items.length, 3);
  assert.equal(hikeTrip.items.length, 1);
  assert.equal(hikeTrip.bags.length, 1);
  assert.equal(hikeTrip.bags[0].name, 'Backpack');
  assert.equal(hikeTrip.items[0].name, 'Hiking Boots');
});

// ---------------------------------------------------------------------------
// Group 2: Validation / error handling
// ---------------------------------------------------------------------------

test('Malformed YAML rejected by yamlToFullBackup', () => {
  assert.throws(() => yamlToFullBackup('this is not yaml: [[['), /Failed to parse/);
});

test('Wrong version rejected by yamlToFullBackup', () => {
  const yaml = `
version: "2.0"
categories: []
masterItems: []
bagTemplates: []
trips: []
`;
  assert.throws(() => yamlToFullBackup(yaml), /Invalid backup/);
});

test('Missing required version field rejected by yamlToFullBackup', () => {
  const yaml = `
categories: []
masterItems: []
bagTemplates: []
trips: []
`;
  assert.throws(() => yamlToFullBackup(yaml), /Failed to parse/);
});

test('Invalid trip YAML rejected by yamlToTrip (missing trip.name)', () => {
  const yaml = `
trip:
  destination: "Nowhere"
bags: []
items: []
`;
  assert.throws(() => yamlToTrip(yaml), /Failed to parse/);
});

// ---------------------------------------------------------------------------
// Group 3: Database round-trip (D1)
// ---------------------------------------------------------------------------

test('Full DB round-trip: seed, export, delete, import, verify', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'backup_rt_user';

  await seedUserData(db, userId);
  const snapshotBefore = await loadSnapshot(db, userId);
  const summaryBefore = summarizeSnapshot(snapshotBefore);

  const yamlStr = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  await deleteAllUserData(userId, db);

  const parsed = yamlToFullBackup(yamlStr);
  await importBackupForUser(db, userId, parsed);

  const snapshotAfter = await loadSnapshot(db, userId);
  const summaryAfter = summarizeSnapshot(snapshotAfter);

  assert.deepStrictEqual(summaryAfter, summaryBefore);
});

test('Container linkage survives DB round-trip', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'container_rt_user';

  await seedUserData(db, userId);

  const snapshotBefore = await loadSnapshot(db, userId);
  const containerBefore = snapshotBefore.trips[0].items.find((i) => i.name === 'Toothbrush');
  assert.ok(containerBefore?.container_item_id, 'Toothbrush should have a container before export');

  const yamlStr = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  await deleteAllUserData(userId, db);
  const parsed = yamlToFullBackup(yamlStr);
  await importBackupForUser(db, userId, parsed);

  const snapshotAfter = await loadSnapshot(db, userId);
  const toothbrush = snapshotAfter.trips[0].items.find((i) => i.name === 'Toothbrush');
  assert.ok(toothbrush?.container_item_id, 'Toothbrush should still have a container after import');

  const toiletryKit = snapshotAfter.trips[0].items.find((i) => i.name === 'Toiletry Kit');
  assert.ok(toiletryKit);
  assert.equal(toothbrush.container_item_id, toiletryKit.id);
});

test('Multiple trips DB round-trip', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'multi_trip_rt_user';

  await seedUserData(db, userId);

  // Add a second trip
  const trip2 = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'Weekend Getaway',
      destination: 'Mountains',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      notes: null,
    })
    .returning()
    .get();

  const bag2 = await db
    .insert(bags)
    .values({
      trip_id: trip2.id,
      name: 'Backpack',
      type: 'personal',
      color: '#22c55e',
      sort_order: 0,
    })
    .returning()
    .get();

  await db.insert(tripItems).values({
    trip_id: trip2.id,
    bag_id: bag2.id,
    name: 'Water Bottle',
    category_name: 'Essentials',
    quantity: 1,
    is_container: false,
    is_packed: false,
    notes: '1 liter',
  });

  const snapshotBefore = await loadSnapshot(db, userId);
  const summaryBefore = summarizeSnapshot(snapshotBefore);

  assert.equal(snapshotBefore.trips.length, 2);

  const yamlStr = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  await deleteAllUserData(userId, db);
  const parsed = yamlToFullBackup(yamlStr);
  await importBackupForUser(db, userId, parsed);

  const snapshotAfter = await loadSnapshot(db, userId);
  const summaryAfter = summarizeSnapshot(snapshotAfter);

  assert.deepStrictEqual(summaryAfter, summaryBefore);
});

test('Idempotent reimport: importing backup twice yields same snapshot', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'idempotent_user';

  await seedUserData(db, userId);

  const snapshotBefore = await loadSnapshot(db, userId);
  const summaryBefore = summarizeSnapshot(snapshotBefore);

  const yamlStr = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  // First import into clean DB
  await deleteAllUserData(userId, db);
  const parsed1 = yamlToFullBackup(yamlStr);
  await importBackupForUser(db, userId, parsed1);

  const summaryFirst = summarizeSnapshot(await loadSnapshot(db, userId));

  // Second import into clean DB
  await deleteAllUserData(userId, db);
  const parsed2 = yamlToFullBackup(yamlStr);
  await importBackupForUser(db, userId, parsed2);

  const summarySecond = summarizeSnapshot(await loadSnapshot(db, userId));

  assert.deepStrictEqual(summaryFirst, summaryBefore);
  assert.deepStrictEqual(summarySecond, summaryBefore);
});

// ---------------------------------------------------------------------------
// Group 4: Case sensitivity and matching
// ---------------------------------------------------------------------------

test('Case-insensitive category matching on reimport', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'case_cat_user';

  await seedUserData(db, userId);

  const snapshotBefore = await loadSnapshot(db, userId);
  const yamlStr = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  await deleteAllUserData(userId, db);

  // Modify the YAML to use lowercase category names
  const modified = yamlStr.replace(/Toiletries/g, 'toiletries').replace(/Documents/g, 'documents');
  const parsed = yamlToFullBackup(modified);

  // importBackupForUser uses case-insensitive lookup for category matching
  await importBackupForUser(db, userId, parsed);

  const snapshotAfter = await loadSnapshot(db, userId);

  // Categories get inserted with whatever case the backup has
  const catNames = snapshotAfter.categories.map((c) => c.name);
  assert.ok(catNames.includes('toiletries'));
  assert.ok(catNames.includes('documents'));

  // Master items should still be linked to the correct categories
  const passportMaster = snapshotAfter.masterItems.find((i) => i.name === 'Passport');
  assert.ok(passportMaster);
  assert.ok(passportMaster.category_id, 'Passport should have a category_id');
  assert.equal(passportMaster.category_name, 'documents');
});

test('Case-insensitive item name matching through YAML round-trip', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'case_item_user';

  await seedUserData(db, userId);

  const snapshotBefore = await loadSnapshot(db, userId);
  const yamlStr = fullBackupToYAML(
    snapshotBefore.categories,
    snapshotBefore.masterItems,
    snapshotBefore.bagTemplates,
    snapshotBefore.trips
  );

  await deleteAllUserData(userId, db);

  // Modify the YAML to use uppercase item name
  const modified = yamlStr.replace(/name: Passport/g, 'name: PASSPORT');
  const parsed = yamlToFullBackup(modified);
  await importBackupForUser(db, userId, parsed);

  const snapshotAfter = await loadSnapshot(db, userId);
  const passportItem = snapshotAfter.trips[0].items.find((i) => i.name === 'PASSPORT');
  assert.ok(passportItem, 'PASSPORT item should exist after import');
  assert.equal(passportItem.is_packed, true);
  assert.equal(passportItem.notes, 'Check expiration date');
});

// ---------------------------------------------------------------------------
// Group 5: The real exportBackupData / restoreBackupData / restoreTripContents
// (src/lib/backup.ts), running over the real API handlers via makeHandlerApi.
// ---------------------------------------------------------------------------

const TEST_USER = 'restore_user';

async function handlerBackedDb(failWhen?: FailHook) {
  const d1 = await createTestDatabase();
  return { db: drizzle(d1), api: makeHandlerApi(d1, TEST_USER, { failWhen }) };
}

async function tripItemsIn(db: ReturnType<typeof drizzle>, tripId: string) {
  return db.select().from(tripItems).where(eq(tripItems.trip_id, tripId)).all();
}

async function onlyTrip(db: ReturnType<typeof drizzle>) {
  const [trip] = await db.select().from(trips).all();
  assert.ok(trip, 'expected a restored trip');
  return trip;
}

test('exportBackupData throws when any fetch fails, instead of writing a partial backup', async () => {
  const { api } = await handlerBackedDb((method, endpoint) =>
    method === 'GET' && endpoint === '/api/trips' ? 'network down' : undefined
  );
  await assert.rejects(() => exportBackupData([], [], api), /Backup failed/);
});

test('exportBackupData throws when a per-trip fetch fails', async () => {
  const { api } = await handlerBackedDb((method, endpoint) =>
    method === 'GET' && /\/trips\/[^/]+\/items$/.test(endpoint) ? 'items unavailable' : undefined
  );
  assert.ok((await api.post('/api/trips', { name: 'Beach Trip' })).success);

  await assert.rejects(() => exportBackupData([], [], api), /Backup failed.*items.*Beach Trip/);
});

test('restoreBackupData throws immediately on structural failure (category creation)', async () => {
  const fixture = makeFullBackupFixture();
  const yamlStr = fullBackupToYAML(fixture.categories, [], [], []);
  const { db, api } = await handlerBackedDb((method, endpoint) =>
    method === 'POST' && endpoint === '/api/categories' ? 'boom' : undefined
  );

  await assert.rejects(() => restoreBackupData(yamlStr, [], [], api), /Restore failed.*Clothing/);
  assert.equal((await db.select().from(categories).all()).length, 0);
});

test('restoreBackupData reports a failed container link without losing the other items', async () => {
  const fixture = makeFullBackupFixture();
  const yamlStr = fullBackupToYAML([], [], [], fixture.trips);
  const { db, api } = await handlerBackedDb((method, endpoint, body) =>
    method === 'PATCH' && endpoint.endsWith('/items') && body?.container_item_id
      ? 'link rejected'
      : undefined
  );

  await assert.rejects(
    () => restoreBackupData(yamlStr, [], [], api),
    /Restore incomplete: 1 of 3 items failed.*Sunscreen/
  );

  const items = await tripItemsIn(db, (await onlyTrip(db)).id);
  assert.equal(items.length, 3, 'every item was still created');
  assert.equal(items.find((i) => i.name === 'Sunscreen')?.container_item_id, null);
});

test('restoreBackupData counts every item of a failed batch as failed', async () => {
  const fixture = makeFullBackupFixture();
  const yamlStr = fullBackupToYAML([], [], [], fixture.trips);
  const { db, api } = await handlerBackedDb((method, endpoint, body) =>
    method === 'POST' && endpoint.endsWith('/items') && body?.items ? 'batch rejected' : undefined
  );

  await assert.rejects(
    () => restoreBackupData(yamlStr, [], [], api),
    /Restore incomplete: 3 of 3 items failed/
  );
  assert.equal((await tripItemsIn(db, (await onlyTrip(db)).id)).length, 0);
});

test('restoreBackupData relinks containers for items matched to existing rows, not just newly created ones', async () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const yamlStr = fullBackupToYAML([], [], [], [{ trip, bags: bagList, items }]);
  const { db, api } = await handlerBackedDb();

  // Pre-seed the trip with the backup's ids so restore matches instead of
  // creating, but without the nesting, which restore must put back.
  await db.insert(trips).values({ ...trip, clerk_user_id: TEST_USER });
  await db.insert(bags).values(bagList);
  await db.insert(tripItems).values(items.map((item) => ({ ...item, container_item_id: null })));

  await restoreBackupData(yamlStr, [], [], api);

  const restored = await tripItemsIn(db, trip.id);
  const kit = restored.find((i) => i.name === 'Toiletry Kit');
  const sunscreen = restored.find((i) => i.name === 'Sunscreen');
  assert.ok(kit && sunscreen);
  assert.equal(sunscreen.container_item_id, kit.id, 'Sunscreen is back in the Toiletry Kit');
  assert.equal(restored.length, items.length, 'no duplicates were created');
});

test('restoreTripContents restores every field, nesting, and same-name items into a new trip', async () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const socks = (bag_id: string | null, quantity: number): TripItem => ({
    ...items[2],
    id: crypto.randomUUID(),
    name: 'Socks',
    category_name: 'Clothing',
    bag_id,
    quantity,
  });
  items[2].is_skipped = true;
  items.push(socks(bagList[0].id, 3), socks(null, 1));
  const tripExport = yamlToTrip(tripToYAML(trip, bagList, items));

  const { db, api } = await handlerBackedDb();
  const created = await api.post<Trip>('/api/trips', { name: 'Imported' });
  const tripId = created.data!.id;

  const result = await restoreTripContents(tripId, tripExport, { api });
  assert.deepEqual(result, { created: 5, updated: 0, failures: [] });

  const restored = await tripItemsIn(db, tripId);
  const [duffel] = await db.select().from(bags).where(eq(bags.trip_id, tripId)).all();
  const byName = (name: string) => restored.filter((i) => i.name === name);
  const [kit] = byName('Toiletry Kit');
  const [sunscreen] = byName('Sunscreen');
  const [sandals] = byName('Sandals');

  assert.equal(kit.is_container, true);
  assert.equal(kit.bag_id, duffel.id);
  assert.equal(kit.notes, 'Ziplock bag');
  assert.equal(sunscreen.container_item_id, kit.id);
  assert.equal(sunscreen.is_packed, true);
  assert.equal(sunscreen.quantity, 2);
  assert.equal(sunscreen.notes, 'SPF 50');
  assert.equal(sandals.is_skipped, true);
  assert.deepEqual(
    byName('Socks')
      .map((s) => [s.bag_id, s.quantity])
      .sort((a, b) => Number(b[1]) - Number(a[1])),
    [
      [duffel.id, 3],
      [null, 1],
    ],
    'same-name items stay separate instead of merging'
  );
});

test('restoreTripContents merge: matches bags case-insensitively and takes items out of containers they left', async () => {
  const { trip, bags: bagList, items } = makeTripFixture();
  const { db, api } = await handlerBackedDb();
  await db.insert(trips).values({ ...trip, clerk_user_id: TEST_USER });
  await db.insert(bags).values(bagList);
  // Sandals currently sits (bagless) inside the Toiletry Kit.
  const kitId = items[0].id;
  await db
    .insert(tripItems)
    .values(items.map((i) => (i.name === 'Sandals' ? { ...i, container_item_id: kitId } : i)));

  // The file puts Sandals loose in the Duffel, and names the bag by name only.
  const tripExport = yamlToTrip(tripToYAML(trip, bagList, items));
  for (const bag of tripExport.bags) {
    bag.source_id = undefined;
    bag.name = 'DUFFEL';
  }
  for (const item of tripExport.items) {
    item.bag_source_id = null;
    if (item.name === 'Sandals') item.bag_name = 'duffel';
    else if (item.bag_name) item.bag_name = 'DUFFEL';
  }

  const result = await restoreTripContents(trip.id, tripExport, { merge: true, api });
  assert.deepEqual(result, { created: 0, updated: 3, failures: [] });

  assert.equal((await db.select().from(bags).where(eq(bags.trip_id, trip.id)).all()).length, 1);
  const sandals = (await tripItemsIn(db, trip.id)).find((i) => i.name === 'Sandals');
  assert.equal(sandals?.bag_id, bagList[0].id);
  assert.equal(sandals?.container_item_id, null);
});
