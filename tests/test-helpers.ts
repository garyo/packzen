import { createSQLiteDB } from '@miniflare/shared';
import { D1Database, D1DatabaseAPI } from '@miniflare/d1';
import { drizzle } from 'drizzle-orm/d1';
import { eq, asc } from 'drizzle-orm';
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
import type { FullBackup } from '../src/lib/yaml';
import type { APIContext } from 'astro';

export interface Snapshot {
  categories: Category[];
  masterItems: (MasterItem & { category_name: string | null })[];
  bagTemplates: BagTemplate[];
  trips: Array<{
    trip: Trip;
    bags: Bag[];
    items: TripItem[];
  }>;
}

export interface TripItemSummary {
  name: string;
  category: string | null;
  bag: string | null;
  container: string | null;
  is_container: boolean;
  is_packed: boolean;
  notes: string | null;
}

export const TEST_SCHEMA_STATEMENTS = [
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
    is_skipped INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    FOREIGN KEY (bag_id) REFERENCES bags(id) ON DELETE SET NULL,
    FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE SET NULL
  );`,
];

export async function applyMigrations(db: D1Database) {
  for (const statement of TEST_SCHEMA_STATEMENTS) {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    await db.exec(normalized);
  }
}

export async function createTestDatabase() {
  const sqliteDb = await createSQLiteDB(':memory:');
  const d1 = new D1Database(new D1DatabaseAPI(sqliteDb));
  await applyMigrations(d1);
  return d1;
}

export function buildApiContext({
  db,
  userId,
  billingStatus,
  request,
  params,
}: {
  db: D1Database;
  userId: string;
  billingStatus?: import('../src/lib/billing').BillingStatus;
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

export async function seedUserData(db: ReturnType<typeof drizzle>, userId: string) {
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

export async function loadSnapshot(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<Snapshot> {
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
    .all()) as (MasterItem & { category_name: string | null })[];

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

export function summarizeSnapshot(snapshot: Snapshot) {
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

export async function importBackupForUser(
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
