import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { restoreFullBackup } from '../src/lib/backup';
import { makeHandlerApi } from './handler-api';
import type { ApiResponse } from '../src/lib/types';
import type { APIContext, APIRoute } from 'astro';
import { D1_MAX_BOUND_PARAMS } from '../src/lib/d1';
import { createBilling, type Billing } from '../src/lib/billing';

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
  is_skipped: boolean;
  notes: string | null;
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations/', import.meta.url));

/** Apply db/migrations/*.sql in order, exactly as wrangler does for D1. */
function applyMigrations(sqliteDb: Awaited<ReturnType<typeof createSQLiteDB>>) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    sqliteDb.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
}

/**
 * Production D1 rejects any statement binding more than 100 parameters, while
 * local SQLite allows 32766 — so an oversized batch insert or `inArray` passes
 * here and 500s in production. Make it fail here too, and fail the whole run
 * even if a route handler swallows the error into a 5xx.
 */
function enforceD1ParamLimit(d1: D1Database) {
  const prepare = d1.prepare.bind(d1);
  d1.prepare = (query: string) => {
    const statement = prepare(query);
    const bind = statement.bind.bind(statement);
    statement.bind = (...values: unknown[]) => {
      if (values.length > D1_MAX_BOUND_PARAMS) {
        process.exitCode = 1;
        throw new Error(
          `D1 allows at most ${D1_MAX_BOUND_PARAMS} bound parameters; got ${values.length} in: ${query.slice(0, 120)}`
        );
      }
      return bind(...values);
    };
    return statement;
  };
}

export async function createTestDatabase() {
  const sqliteDb = await createSQLiteDB(':memory:');
  applyMigrations(sqliteDb);
  const d1 = new D1Database(new D1DatabaseAPI(sqliteDb));
  enforceD1ParamLimit(d1);
  return d1;
}

export function buildApiContext({
  db,
  userId,
  billing = createBilling('free_user'),
  request,
  params,
}: {
  db: D1Database;
  userId: string;
  billing?: Billing;
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
      billing,
    },
    url: new URL(req.url),
    redirect: () => {
      throw new Error('Not implemented');
    },
    site: new URL('http://localhost'),
    props: {},
  } as unknown as APIContext;
}

/** Call an API route handler with a JSON body (a string body is sent as-is). */
export async function callApi(
  handler: APIRoute | undefined,
  db: D1Database,
  userId: string,
  {
    method = 'GET',
    body,
    params,
    billing,
  }: { method?: string; body?: unknown; params?: Record<string, string>; billing?: Billing } = {}
): Promise<Response> {
  const request = new Request('http://localhost/api', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
  });
  return handler!(buildApiContext({ db, userId, request, params, billing }));
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
        is_skipped: item.is_skipped,
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

/** Restore `backup` for `userId` with the production restore code over the real handlers. */
export async function importBackupForUser(
  db: ReturnType<typeof drizzle>,
  userId: string,
  backup: FullBackup
) {
  const api = makeHandlerApi(db.$client as unknown as D1Database, userId);
  const [categoriesResponse, masterItemsResponse] = await Promise.all([
    api.get<Category[]>('/api/categories'),
    api.get<MasterItem[]>('/api/master-items'),
  ]);
  await restoreFullBackup(
    backup,
    categoriesResponse.data ?? [],
    masterItemsResponse.data ?? [],
    api
  );
}

// ---------------------------------------------------------------------------
// Fake API client for testing src/lib/backup.ts against the real
// exportBackupData/restoreBackupData functions (not a reimplementation).
// Models just enough of the REST surface (categories, master items, bag
// templates, trips, bags, trip items) in memory so restore/export can run
// end-to-end, with an optional hook for injecting per-call failures.
// ---------------------------------------------------------------------------

type FakeRecord = Record<string, unknown> & { id: string };
type FailHook = (
  method: 'get' | 'post' | 'patch',
  endpoint: string,
  data?: Record<string, unknown>
) => string | undefined;

export interface FakeApi {
  api: {
    get: <T>(endpoint: string) => Promise<ApiResponse<T>>;
    post: <T>(endpoint: string, data?: unknown) => Promise<ApiResponse<T>>;
    patch: <T>(endpoint: string, data?: unknown) => Promise<ApiResponse<T>>;
    put: <T>(endpoint: string, data?: unknown) => Promise<ApiResponse<T>>;
    delete: <T>(endpoint: string) => Promise<ApiResponse<T>>;
  };
  categories: FakeRecord[];
  masterItems: FakeRecord[];
  bagTemplates: FakeRecord[];
  trips: FakeRecord[];
  bagsByTrip: Map<string, FakeRecord[]>;
  itemsByTrip: Map<string, FakeRecord[]>;
}

export function makeFakeApi(options: { failWhen?: FailHook } = {}): FakeApi {
  const { failWhen } = options;
  let idCounter = 0;
  const newId = () => `fake-${++idCounter}`;

  const categories: FakeRecord[] = [];
  const masterItems: FakeRecord[] = [];
  const bagTemplates: FakeRecord[] = [];
  const trips: FakeRecord[] = [];
  const bagsByTrip = new Map<string, FakeRecord[]>();
  const itemsByTrip = new Map<string, FakeRecord[]>();

  const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data });
  const fail = <T>(error: string): ApiResponse<T> => ({ success: false, error });

  const tripSubResource = (endpoint: string, resource: 'bags' | 'items') => {
    const match = endpoint.match(new RegExp(`^/api/trips/([^/]+)/${resource}$`));
    return match ? match[1] : null;
  };

  async function get<T>(endpoint: string): Promise<ApiResponse<T>> {
    const failure = failWhen?.('get', endpoint);
    if (failure) return fail(failure);

    if (endpoint === '/api/categories') return ok(categories as unknown as T);
    if (endpoint === '/api/master-items') return ok(masterItems as unknown as T);
    if (endpoint === '/api/bag-templates') return ok(bagTemplates as unknown as T);
    if (endpoint === '/api/trips') return ok(trips as unknown as T);

    const bagTripId = tripSubResource(endpoint, 'bags');
    if (bagTripId) return ok((bagsByTrip.get(bagTripId) || []) as unknown as T);

    const itemTripId = tripSubResource(endpoint, 'items');
    if (itemTripId) return ok((itemsByTrip.get(itemTripId) || []) as unknown as T);

    return fail(`fake api: unknown GET ${endpoint}`);
  }

  async function post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    const payload = (data || {}) as Record<string, unknown>;
    const failure = failWhen?.('post', endpoint, payload);
    if (failure) return fail(failure);

    const created: FakeRecord = { id: newId(), ...payload };

    if (endpoint === '/api/categories') {
      categories.push(created);
      return ok(created as unknown as T);
    }
    if (endpoint === '/api/master-items') {
      masterItems.push(created);
      return ok(created as unknown as T);
    }
    if (endpoint === '/api/bag-templates') {
      bagTemplates.push(created);
      return ok(created as unknown as T);
    }
    if (endpoint === '/api/trips') {
      trips.push(created);
      return ok(created as unknown as T);
    }

    const bagTripId = tripSubResource(endpoint, 'bags');
    if (bagTripId) {
      const list = bagsByTrip.get(bagTripId) || [];
      list.push(created);
      bagsByTrip.set(bagTripId, list);
      return ok(created as unknown as T);
    }

    const itemTripId = tripSubResource(endpoint, 'items');
    if (itemTripId) {
      const list = itemsByTrip.get(itemTripId) || [];
      list.push(created);
      itemsByTrip.set(itemTripId, list);
      return ok(created as unknown as T);
    }

    return fail(`fake api: unknown POST ${endpoint}`);
  }

  async function patch<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    const payload = (data || {}) as Record<string, unknown>;
    const failure = failWhen?.('patch', endpoint, payload);
    if (failure) return fail(failure);

    const applyTo = (list: FakeRecord[], id: unknown): ApiResponse<T> => {
      const record = list.find((r) => r.id === id);
      if (!record) return fail(`fake api: no record with id ${String(id)} at ${endpoint}`);
      Object.assign(record, payload);
      return ok(record as unknown as T);
    };

    const categoryMatch = endpoint.match(/^\/api\/categories\/([^/]+)$/);
    if (categoryMatch) return applyTo(categories, categoryMatch[1]);

    const masterItemMatch = endpoint.match(/^\/api\/master-items\/([^/]+)$/);
    if (masterItemMatch) return applyTo(masterItems, masterItemMatch[1]);

    const bagTemplateMatch = endpoint.match(/^\/api\/bag-templates\/([^/]+)$/);
    if (bagTemplateMatch) return applyTo(bagTemplates, bagTemplateMatch[1]);

    const tripMatch = endpoint.match(/^\/api\/trips\/([^/]+)$/);
    if (tripMatch) return applyTo(trips, tripMatch[1]);

    const bagTripId = tripSubResource(endpoint, 'bags');
    if (bagTripId) return applyTo(bagsByTrip.get(bagTripId) || [], payload.bag_id);

    const itemTripId = tripSubResource(endpoint, 'items');
    if (itemTripId) return applyTo(itemsByTrip.get(itemTripId) || [], payload.id);

    return fail(`fake api: unknown PATCH ${endpoint}`);
  }

  return {
    api: {
      get,
      post,
      patch,
      put: async <T>() => fail<T>('fake api: PUT not supported'),
      delete: async <T>() => fail<T>('fake api: DELETE not supported'),
    },
    categories,
    masterItems,
    bagTemplates,
    trips,
    bagsByTrip,
    itemsByTrip,
  };
}
