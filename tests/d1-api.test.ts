import test from 'node:test';
import assert from 'node:assert/strict';
import { createSQLiteDB } from '@miniflare/shared';
import { D1Database, D1DatabaseAPI } from '@miniflare/d1';
import { drizzle } from 'drizzle-orm/d1';
import { eq, asc, count } from 'drizzle-orm';
import {
  bagTemplates,
  bags,
  categories,
  masterItems,
  tripItems,
  trips,
  type Bag,
  type BagTemplate,
  type Category,
  type MasterItem,
  type Trip,
  type TripItem,
} from '../db/schema';
import { fullBackupToYAML, yamlToFullBackup, type FullBackup } from '../src/lib/yaml';
import { deleteAllUserData } from '../src/lib/user-data-cleanup';
import type { APIContext } from 'astro';
import * as bagTemplatesApi from '../src/pages/api/bag-templates/index';
import * as tripsApiIndex from '../src/pages/api/trips/index';
import * as tripItemsApi from '../src/pages/api/trips/[tripId]/items';
import { getLimitsForPlan } from '../src/lib/resource-limits';

interface Snapshot {
  categories: Category[];
  masterItems: (MasterItem & { category_name: string | null })[];
  bagTemplates: BagTemplate[];
  trips: Array<{
    trip: Trip;
    bags: Bag[];
    items: TripItem[];
  }>;
}

async function createTestDatabase() {
  const sqliteDb = await createSQLiteDB(':memory:');
  const d1 = new D1Database(new D1DatabaseAPI(sqliteDb));
  await applyMigrations(d1);
  return d1;
}

const TEST_SCHEMA_STATEMENTS = [
  `CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE master_items (
    id TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    default_quantity INTEGER NOT NULL DEFAULT 1,
    is_container INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE bag_templates (
    id TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    destination TEXT,
    start_date TEXT,
    end_date TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE bags (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE trip_items (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    bag_id TEXT,
    master_item_id TEXT,
    container_item_id TEXT,
    is_container INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    category_name TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    is_packed INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    FOREIGN KEY (bag_id) REFERENCES bags(id) ON DELETE SET NULL,
    FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE SET NULL
  );`,
];

async function applyMigrations(db: D1Database) {
  for (const statement of TEST_SCHEMA_STATEMENTS) {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    await db.exec(normalized);
  }
}

function buildApiContext({
  db,
  userId,
  billingStatus,
  request,
  params,
}: {
  db: D1Database;
  userId: string;
  billingStatus?: { activePlan: 'free_user' | 'standard' | 'none' };
  request?: Request;
  params?: Record<string, string>;
}): APIContext {
  const req = request ?? new Request('http://localhost', { method: 'GET' });

  return {
    request: req,
    params: params ?? {},
    locals: {
      runtime: { env: { DB: db } },
      userId,
      billingStatus: billingStatus || {
        activePlan: 'free_user',
        hasFreeUserPlan: true,
        hasStandardPlan: false,
      },
    },
    url: new URL('http://localhost'),
    redirect: () => {
      throw new Error('Not implemented');
    },
    site: new URL('http://localhost'),
    props: {},
  } as unknown as APIContext;
}

async function seedUserData(db: ReturnType<typeof drizzle>, userId: string) {
  const toiletriesCategory = await db
    .insert(categories)
    .values({
      clerk_user_id: userId,
      name: 'Toiletries',
      icon: '🧴',
      sort_order: 1,
    })
    .returning()
    .get();

  const docsCategory = await db
    .insert(categories)
    .values({
      clerk_user_id: userId,
      name: 'Documents',
      icon: '📄',
      sort_order: 2,
    })
    .returning()
    .get();

  await db.insert(bagTemplates).values({
    clerk_user_id: userId,
    name: 'Carry-on Template',
    type: 'carry_on',
    color: '#0ea5e9',
    sort_order: 1,
  });

  const passportItem = await db
    .insert(masterItems)
    .values({
      clerk_user_id: userId,
      name: 'Passport',
      description: 'Valid passport',
      category_id: docsCategory.id,
      default_quantity: 1,
      is_container: false,
    })
    .returning()
    .get();

  const toiletriesBagItem = await db
    .insert(masterItems)
    .values({
      clerk_user_id: userId,
      name: 'Toiletry Kit',
      description: 'Small bag for toiletries',
      category_id: toiletriesCategory.id,
      default_quantity: 1,
      is_container: true,
    })
    .returning()
    .get();

  const trip = await db
    .insert(trips)
    .values({
      clerk_user_id: userId,
      name: 'European Adventure',
      destination: 'Paris',
      start_date: '2026-05-01',
      end_date: '2026-05-14',
      notes: 'Pack light for trains',
    })
    .returning()
    .get();

  const carryOn = await db
    .insert(bags)
    .values({
      trip_id: trip.id,
      name: 'Carry-on',
      type: 'carry_on',
      color: '#3b82f6',
      sort_order: 1,
    })
    .returning()
    .get();

  const daypack = await db
    .insert(bags)
    .values({
      trip_id: trip.id,
      name: 'Daypack',
      type: 'personal',
      color: '#22c55e',
      sort_order: 2,
    })
    .returning()
    .get();

  const toiletryContainer = await db
    .insert(tripItems)
    .values({
      trip_id: trip.id,
      name: 'Toiletry Kit',
      category_name: 'Toiletries',
      quantity: 1,
      bag_id: carryOn.id,
      master_item_id: toiletriesBagItem.id,
      is_container: true,
      is_packed: false,
      notes: 'Holds liquids',
    })
    .returning()
    .get();

  await db.insert(tripItems).values({
    trip_id: trip.id,
    name: 'Passport',
    category_name: 'Documents',
    quantity: 1,
    bag_id: carryOn.id,
    master_item_id: passportItem.id,
    is_container: false,
    is_packed: true,
    notes: 'Check expiration date',
  });

  await db.insert(tripItems).values({
    trip_id: trip.id,
    name: 'Toothbrush',
    category_name: 'Toiletries',
    quantity: 1,
    bag_id: carryOn.id,
    container_item_id: toiletryContainer.id,
    is_container: false,
    is_packed: false,
    notes: 'Replace every trip',
  });

  await db.insert(tripItems).values({
    trip_id: trip.id,
    name: 'Guidebook',
    category_name: 'Misc',
    quantity: 1,
    bag_id: daypack.id,
    is_container: false,
    is_packed: false,
    notes: null,
  });
}

async function loadSnapshot(db: ReturnType<typeof drizzle>, userId: string): Promise<Snapshot> {
  const categoriesList = await db
    .select()
    .from(categories)
    .where(eq(categories.clerk_user_id, userId))
    .orderBy(asc(categories.sort_order))
    .all();

  const categoryNameById = new Map(categoriesList.map((category) => [category.id, category.name]));

  const masterItemsList = (await db
    .select()
    .from(masterItems)
    .where(eq(masterItems.clerk_user_id, userId))
    .orderBy(asc(masterItems.name))
    .all()) as (MasterItem & { category_name?: string | null })[];

  masterItemsList.forEach((item) => {
    item.category_name = item.category_id ? categoryNameById.get(item.category_id) || null : null;
  });

  const bagTemplatesList = await db
    .select()
    .from(bagTemplates)
    .where(eq(bagTemplates.clerk_user_id, userId))
    .orderBy(asc(bagTemplates.sort_order))
    .all();

  const tripsList = await db
    .select()
    .from(trips)
    .where(eq(trips.clerk_user_id, userId))
    .orderBy(asc(trips.start_date))
    .all();

  const tripsWithData = await Promise.all(
    tripsList.map(async (trip) => {
      const bagList = await db
        .select()
        .from(bags)
        .where(eq(bags.trip_id, trip.id))
        .orderBy(asc(bags.sort_order))
        .all();

      const itemList = await db
        .select()
        .from(tripItems)
        .where(eq(tripItems.trip_id, trip.id))
        .orderBy(asc(tripItems.name))
        .all();

      return { trip, bags: bagList, items: itemList };
    })
  );

  return {
    categories: categoriesList,
    masterItems: masterItemsList,
    bagTemplates: bagTemplatesList,
    trips: tripsWithData,
  };
}

interface TripItemSummary {
  name: string;
  category: string | null;
  bag: string | null;
  container: string | null;
  is_container: boolean;
  is_packed: boolean;
  notes: string | null;
}

function summarizeSnapshot(snapshot: Snapshot) {
  return {
    categories: snapshot.categories.map((c) => ({
      name: c.name,
      icon: c.icon,
      sort_order: c.sort_order,
    })),
    masterItems: snapshot.masterItems.map((item) => ({
      name: item.name,
      category_name: item.category_name,
      is_container: item.is_container,
      default_quantity: item.default_quantity,
    })),
    bagTemplates: snapshot.bagTemplates.map((template) => ({
      name: template.name,
      type: template.type,
      color: template.color,
    })),
    trips: snapshot.trips.map(({ trip, bags: bagList, items }) => {
      const bagNameById = new Map(bagList.map((bag) => [bag.id, bag.name]));
      const itemNameById = new Map(items.map((item) => [item.id, item.name]));

      const itemSummaries: TripItemSummary[] = items.map((item) => ({
        name: item.name,
        category: item.category_name,
        bag: item.bag_id ? bagNameById.get(item.bag_id) || null : null,
        container: item.container_item_id ? itemNameById.get(item.container_item_id) || null : null,
        is_container: item.is_container,
        is_packed: item.is_packed,
        notes: item.notes,
      }));

      itemSummaries.sort(
        (a, b) => a.name.localeCompare(b.name) || (a.bag || '').localeCompare(b.bag || '')
      );

      return {
        trip: {
          name: trip.name,
          destination: trip.destination,
          start_date: trip.start_date,
          end_date: trip.end_date,
          notes: trip.notes,
        },
        bags: bagList.map((bag) => ({ name: bag.name, type: bag.type, color: bag.color })),
        items: itemSummaries,
      };
    }),
  };
}

async function importBackupForUser(
  db: ReturnType<typeof drizzle>,
  userId: string,
  backup: FullBackup
) {
  const categoryNameToId = new Map<string, string>();

  for (const category of backup.categories) {
    const inserted = await db
      .insert(categories)
      .values({
        clerk_user_id: userId,
        name: category.name,
        icon: category.icon,
        sort_order: category.sort_order,
      })
      .returning()
      .get();
    categoryNameToId.set(category.name.toLowerCase(), inserted.id);
  }

  for (const item of backup.masterItems) {
    await db.insert(masterItems).values({
      clerk_user_id: userId,
      name: item.name,
      description: item.description,
      category_id: item.category_name
        ? categoryNameToId.get(item.category_name.toLowerCase()) || null
        : null,
      default_quantity: item.default_quantity,
      is_container: item.is_container ?? false,
    });
  }

  for (const template of backup.bagTemplates) {
    await db.insert(bagTemplates).values({
      clerk_user_id: userId,
      name: template.name,
      type: template.type,
      color: template.color,
      sort_order: template.sort_order,
    });
  }

  for (const tripData of backup.trips) {
    const newTrip = await db
      .insert(trips)
      .values({
        clerk_user_id: userId,
        name: tripData.name,
        destination: tripData.destination || null,
        start_date: tripData.start_date || null,
        end_date: tripData.end_date || null,
        notes: tripData.notes,
      })
      .returning()
      .get();

    const bagSourceMap = new Map<string, string>();
    const bagNameMap = new Map<string, string>();

    for (const bagData of tripData.bags) {
      const insertedBag = await db
        .insert(bags)
        .values({
          trip_id: newTrip.id,
          name: bagData.name,
          type: bagData.type as Bag['type'],
          color: bagData.color,
          sort_order: bagData.sort_order,
        })
        .returning()
        .get();

      bagNameMap.set(bagData.name.toLowerCase(), insertedBag.id);
      if (bagData.source_id) {
        bagSourceMap.set(bagData.source_id, insertedBag.id);
      }
    }

    const itemKey = (item: (typeof tripData.items)[number]) =>
      `${item.name.toLowerCase()}|${(item.category_name || '').toLowerCase()}|${
        item.bag_name ? item.bag_name.toLowerCase() : ''
      }`;

    const itemSourceMap = new Map<string, string>();

    const createdItems: Array<{ backupItem: (typeof tripData.items)[number]; newId: string }> = [];

    for (const itemData of tripData.items) {
      const bagId =
        (itemData.bag_source_id && bagSourceMap.get(itemData.bag_source_id)) ||
        (itemData.bag_name ? bagNameMap.get(itemData.bag_name.toLowerCase()) || null : null);

      const insertedItem = await db
        .insert(tripItems)
        .values({
          trip_id: newTrip.id,
          name: itemData.name,
          category_name: itemData.category_name || null,
          quantity: itemData.quantity,
          bag_id: bagId || null,
          master_item_id: null,
          is_container: itemData.is_container ?? false,
          is_packed: itemData.is_packed,
          notes: itemData.notes || null,
        })
        .returning()
        .get();

      createdItems.push({ backupItem: itemData, newId: insertedItem.id });

      if (itemData.source_id) {
        itemSourceMap.set(itemData.source_id, insertedItem.id);
      }
      itemSourceMap.set(itemKey(itemData), insertedItem.id);
    }

    for (const { backupItem, newId } of createdItems) {
      let parentId: string | undefined =
        (backupItem.container_source_id && itemSourceMap.get(backupItem.container_source_id)) ||
        undefined;

      if (!parentId && backupItem.container_name) {
        const parentBackupItem = tripData.items.find(
          (candidate) =>
            candidate.name.toLowerCase() === backupItem.container_name?.toLowerCase() &&
            (candidate.is_container ?? false)
        );
        if (parentBackupItem) {
          const key = parentBackupItem.source_id ?? itemKey(parentBackupItem);
          parentId = key ? itemSourceMap.get(key) : undefined;
        }
      }

      if (parentId) {
        await db
          .update(tripItems)
          .set({ container_item_id: parentId })
          .where(eq(tripItems.id, newId))
          .run();
      }
    }
  }
}

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
  const limit = getLimitsForPlan({ activePlan: 'free_user' }).maxBagTemplates;
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

  const freeContext = buildApiContext({ db: d1, userId, request: postRequest.clone() });
  const freeResponse = await bagTemplatesApi.POST!(freeContext);
  assert.equal(freeResponse.status, 403);

  const standardContext = buildApiContext({
    db: d1,
    userId,
    request: postRequest.clone(),
    billingStatus: { activePlan: 'standard' },
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
  const limit = getLimitsForPlan({ activePlan: 'free_user' }).maxTrips;

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
  const tripsData = await getResponse.json();
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
  const createdTrip = await response.json();
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
  const updated = await patchResponse.json();
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
  const firstItem = await firstResponse.json();
  assert.equal(firstItem.quantity, 1);

  const secondCtx = buildApiContext({
    db: d1,
    userId,
    request: request({ ...basePayload, quantity: 2 }),
    params: { tripId: trip.id },
  });
  const secondResponse = await tripItemsApi.POST!(secondCtx);
  assert.equal(secondResponse.status, 200);
  const mergedItem = await secondResponse.json();
  assert.equal(mergedItem.quantity, 3);

  const thirdCtx = buildApiContext({
    db: d1,
    userId,
    request: request({ ...basePayload, merge_duplicates: false }),
    params: { tripId: trip.id },
  });
  const thirdResponse = await tripItemsApi.POST!(thirdCtx);
  assert.equal(thirdResponse.status, 201);
  const thirdItem = await thirdResponse.json();
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
  const deleteResult = await deleteResponse.json();
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
