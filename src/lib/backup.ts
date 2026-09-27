import type { Category, MasterItem, BagTemplate, Trip, TripItem, Bag, ApiResponse } from './types';
import { api as defaultApi, endpoints, type ApiClient } from './api';
import {
  fullBackupToYAML,
  yamlToFullBackup,
  type BackupBag,
  type BackupItem,
  type FullBackup,
} from './yaml';
import { chunkArray, mapLimit } from './utils';

/** Enough parallelism to be quick without tripping request timeouts on big restores. */
const MAX_CONCURRENT_REQUESTS = 6;
/** Items per batch-create request (the endpoint accepts up to 500). */
const ITEM_BATCH_SIZE = 100;

const normalize = (value?: string | null) => value?.trim().toLowerCase() || '';

/** Throws if the response failed; otherwise returns its data (defaulting to []). */
function assertSuccess<T>(response: ApiResponse<T>, message: string): T | undefined {
  if (!response.success) {
    throw new Error(`${message}: ${response.error || 'unknown error'}`);
  }
  return response.data;
}

/** Throws unless the response succeeded AND returned data. */
function assertData<T>(response: ApiResponse<T>, message: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(`${message}: ${response.error || 'no data returned'}`);
  }
  return response.data;
}

/** Remove and return the first entry of `pool` matching `predicate`, so each row is matched once. */
function claim<T>(pool: T[], predicate: (item: T) => boolean): T | undefined {
  const index = pool.findIndex(predicate);
  return index === -1 ? undefined : pool.splice(index, 1)[0];
}

export async function exportBackupData(
  categories: Category[],
  masterItems: MasterItem[],
  api: ApiClient = defaultApi
): Promise<{ yaml: string; filename: string }> {
  const [bagTemplatesResponse, tripsResponse] = await Promise.all([
    api.get<BagTemplate[]>(endpoints.bagTemplates),
    api.get<Trip[]>(endpoints.trips),
  ]);
  const bagTemplatesList =
    assertSuccess(bagTemplatesResponse, 'Backup failed: could not fetch My Bags') || [];
  const tripsList = assertSuccess(tripsResponse, 'Backup failed: could not fetch trips') || [];

  const tripsWithData = await mapLimit(tripsList, MAX_CONCURRENT_REQUESTS, async (trip) => {
    const [bagsResponse, itemsResponse] = await Promise.all([
      api.get<Bag[]>(endpoints.tripBags(trip.id)),
      api.get<TripItem[]>(endpoints.tripItems(trip.id)),
    ]);
    const bags = assertSuccess(
      bagsResponse,
      `Backup failed: could not fetch bags for trip "${trip.name}"`
    );
    const items = assertSuccess(
      itemsResponse,
      `Backup failed: could not fetch items for trip "${trip.name}"`
    );
    return { trip, bags: bags || [], items: items || [] };
  });

  const yamlContent = fullBackupToYAML(categories, masterItems, bagTemplatesList, tripsWithData);
  const filename = `packzen-backup-${new Date().toISOString().split('T')[0]}.yaml`;
  return { yaml: yamlContent, filename };
}

export interface TripRestoreResult {
  created: number;
  updated: number;
  /** Items that could not be restored at all. */
  failed: number;
  /**
   * One message per item that could not be restored, or was restored but not
   * nested in its container.
   */
  failures: string[];
}

/**
 * Restore bags and items (with packed/skipped state, notes and container
 * nesting) into an existing trip.
 *
 * With `merge`, the trip's current bags and items are matched first — by
 * source id, then by name (bags) or name+bag+category (items) — and updated
 * in place; everything unmatched is created. Without it the trip is assumed
 * empty. Bag failures throw, since items depend on the bag ids; item
 * failures are collected in the result.
 */
export async function restoreTripContents(
  tripId: string,
  contents: { bags: BackupBag[]; items: BackupItem[] },
  options: { merge?: boolean; api?: ApiClient } = {}
): Promise<TripRestoreResult> {
  const { merge = false, api = defaultApi } = options;

  let existingBags: Bag[] = [];
  let existingItems: TripItem[] = [];
  if (merge) {
    const [bagsResponse, itemsResponse] = await Promise.all([
      api.get<Bag[]>(endpoints.tripBags(tripId)),
      api.get<TripItem[]>(endpoints.tripItems(tripId)),
    ]);
    existingBags = assertSuccess(bagsResponse, 'Could not fetch existing bags') || [];
    existingItems = assertSuccess(itemsResponse, 'Could not fetch existing items') || [];
  }

  // Bags
  const bagIdBySource = new Map<string, string>();
  const bagIdByName = new Map<string, string>();
  const unclaimedBags = [...existingBags];
  const bagPlan = contents.bags.map((bag) => ({
    bag,
    existing:
      (bag.source_id && claim(unclaimedBags, (b) => b.id === bag.source_id)) ||
      claim(unclaimedBags, (b) => normalize(b.name) === normalize(bag.name)),
  }));

  await mapLimit(bagPlan, MAX_CONCURRENT_REQUESTS, async ({ bag, existing }) => {
    const fields = { name: bag.name, type: bag.type, color: bag.color, sort_order: bag.sort_order };
    let id: string;
    if (existing) {
      const response = await api.patch(endpoints.tripBags(tripId), {
        bag_id: existing.id,
        ...fields,
      });
      assertSuccess(response, `Could not update bag "${bag.name}"`);
      id = existing.id;
    } else {
      const response = await api.post<Bag>(endpoints.tripBags(tripId), fields);
      id = assertData(response, `Could not create bag "${bag.name}"`).id;
    }
    if (bag.source_id) bagIdBySource.set(bag.source_id, id);
    if (!bagIdByName.has(normalize(bag.name))) bagIdByName.set(normalize(bag.name), id);
  });

  // Items
  const failures: string[] = [];
  let failed = 0;
  const report = (item: BackupItem, reason?: string) =>
    failures.push(`Item "${item.name}": ${reason || 'unknown error'}`);
  const fail = (item: BackupItem, reason?: string) => {
    failed++;
    report(item, reason);
  };
  const hasContainer = (item: BackupItem) => !!(item.container_source_id || item.container_name);

  const unclaimedItems = [...existingItems];
  const itemPlan = contents.items.map((item) => {
    const bagId =
      (item.bag_source_id && bagIdBySource.get(item.bag_source_id)) ||
      (item.bag_name && bagIdByName.get(normalize(item.bag_name))) ||
      null;
    const existing =
      (item.source_id && claim(unclaimedItems, (i) => i.id === item.source_id)) ||
      claim(
        unclaimedItems,
        (i) =>
          normalize(i.name) === normalize(item.name) &&
          (i.bag_id || null) === bagId &&
          normalize(i.category_name) === normalize(item.category_name)
      );
    const fields = {
      name: item.name,
      category_name: item.category_name ?? null,
      quantity: item.quantity,
      bag_id: bagId,
      is_packed: item.is_packed,
      is_skipped: item.is_skipped,
      is_container: item.is_container,
      notes: item.notes ?? null,
    };
    return { item, existing, fields };
  });

  const restoredIds = new Map<BackupItem, string>();
  let updated = 0;

  const updates = itemPlan.filter((p) => p.existing);
  await mapLimit(updates, MAX_CONCURRENT_REQUESTS, async ({ item, existing, fields }) => {
    const response = await api.patch(endpoints.tripItems(tripId), {
      id: existing!.id,
      ...fields,
      // Items with no container in the file come out of any old one; nested
      // items are linked below.
      ...(!hasContainer(item) && { container_item_id: null }),
    });
    if (!response.success) return fail(item, response.error);
    restoredIds.set(item, existing!.id);
    updated++;
  });

  // The batch endpoint skips names that already exist in the trip or repeat
  // within the batch, so only unambiguous names go through it; the rest are
  // created one by one with merging turned off.
  const creates = itemPlan.filter((p) => !p.existing);
  const takenNames = new Set(
    [...existingItems, ...updates.map((p) => p.item)].map((i) => normalize(i.name))
  );
  const createCounts = new Map<string, number>();
  for (const { item } of creates) {
    createCounts.set(normalize(item.name), (createCounts.get(normalize(item.name)) || 0) + 1);
  }
  const batchable = (item: BackupItem) =>
    !takenNames.has(normalize(item.name)) && createCounts.get(normalize(item.name)) === 1;
  let created = 0;

  for (const batch of chunkArray(
    creates.filter((p) => batchable(p.item)),
    ITEM_BATCH_SIZE
  )) {
    const response = await api.post<TripItem[]>(endpoints.tripItems(tripId), {
      items: batch.map((p) => p.fields),
    });
    const insertedByName = new Map((response.data || []).map((row) => [normalize(row.name), row]));
    for (const { item } of batch) {
      const row = insertedByName.get(normalize(item.name));
      if (!row) {
        fail(item, response.success ? 'trip item limit reached' : response.error);
        continue;
      }
      restoredIds.set(item, row.id);
      created++;
    }
  }

  const singles = creates.filter((p) => !batchable(p.item));
  await mapLimit(singles, MAX_CONCURRENT_REQUESTS, async ({ item, fields }) => {
    const response = await api.post<TripItem>(endpoints.tripItems(tripId), {
      ...fields,
      merge_duplicates: false,
    });
    if (!response.success || !response.data) return fail(item, response.error);
    restoredIds.set(item, response.data.id);
    created++;
  });

  // Container nesting, now that every restorable item has an id.
  const findParent = (child: BackupItem) =>
    (child.container_source_id &&
      contents.items.find((i) => i.source_id === child.container_source_id)) ||
    (child.container_name &&
      (contents.items.find(
        (i) => i.is_container && normalize(i.name) === normalize(child.container_name)
      ) ||
        contents.items.find((i) => normalize(i.name) === normalize(child.container_name)))) ||
    undefined;

  const nested = contents.items.filter((item) => hasContainer(item) && restoredIds.has(item));
  await mapLimit(nested, MAX_CONCURRENT_REQUESTS, async (item) => {
    const parent = findParent(item);
    const parentId = parent && restoredIds.get(parent);
    if (!parentId) {
      return report(
        item,
        `could not find container "${item.container_name || item.container_source_id}"`
      );
    }
    const response = await api.patch(endpoints.tripItems(tripId), {
      id: restoredIds.get(item),
      container_item_id: parentId,
    });
    if (!response.success) report(item, `could not put it in its container (${response.error})`);
  });

  return { created, updated, failed, failures };
}

/** One-line summary of a trip import for a toast, naming the first few failures. */
export function describeTripRestore({
  created,
  updated,
  failed,
  failures,
}: TripRestoreResult): string {
  const restored = created + updated;
  const counts = updated > 0 ? `${created} new, ${updated} updated` : `${created} new`;
  if (failures.length === 0) {
    return `Imported ${restored} item${restored === 1 ? '' : 's'} (${counts})`;
  }
  const shown = failures.slice(0, 3).join('; ');
  const more = failures.length > 3 ? `; and ${failures.length - 3} more` : '';
  const failedCount = failed > 0 ? `; ${failed} failed` : '';
  return `Imported ${restored} of ${restored + failed} items${failedCount}. ${shown}${more}`;
}

export async function restoreBackupData(
  yamlText: string,
  currentCategories: Category[],
  currentMasterItems: MasterItem[],
  api: ApiClient = defaultApi
): Promise<void> {
  await restoreFullBackup(yamlToFullBackup(yamlText), currentCategories, currentMasterItems, api);
}

export async function restoreFullBackup(
  backup: FullBackup,
  currentCategories: Category[],
  currentMasterItems: MasterItem[],
  api: ApiClient = defaultApi
): Promise<void> {
  const categoryNameToId = new Map<string, string>();

  // Failures that don't corrupt dependent data are collected and reported at
  // the end, rather than aborting the whole restore.
  const masterItemFailures: string[] = [];
  const itemFailures: string[] = [];

  // Phase 1: Categories (must complete before My Items, which reference
  // category IDs). Any failure aborts the restore.
  await mapLimit(backup.categories, MAX_CONCURRENT_REQUESTS, async (category) => {
    const fields = { name: category.name, icon: category.icon, sort_order: category.sort_order };
    const existing = currentCategories.find((c) => normalize(c.name) === normalize(category.name));
    if (existing) {
      const response = await api.patch(endpoints.category(existing.id), fields);
      assertSuccess(response, `Restore failed: could not update category "${category.name}"`);
      categoryNameToId.set(normalize(category.name), existing.id);
    } else {
      const response = await api.post<Category>(endpoints.categories, fields);
      const data = assertData(
        response,
        `Restore failed: could not create category "${category.name}"`
      );
      categoryNameToId.set(normalize(category.name), data.id);
    }
  });

  // Phase 2: My Items + My Bags (independent, run in parallel)
  await Promise.all([
    // A failed My Item doesn't corrupt anything else, so failures are
    // collected instead of aborting the restore.
    mapLimit(backup.masterItems, MAX_CONCURRENT_REQUESTS, async (item) => {
      const payload = {
        name: item.name,
        description: item.description,
        category_id:
          (item.category_name && categoryNameToId.get(normalize(item.category_name))) || null,
        default_quantity: item.default_quantity,
        is_container: item.is_container,
      };
      const existing = currentMasterItems.find((i) => normalize(i.name) === normalize(item.name));
      const response = existing
        ? await api.patch(endpoints.masterItem(existing.id), payload)
        : await api.post(endpoints.masterItems, payload);
      if (!response.success) {
        masterItemFailures.push(`My Item "${item.name}": ${response.error}`);
      }
    }),
    (async () => {
      const existingTemplates =
        assertSuccess(
          await api.get<BagTemplate[]>(endpoints.bagTemplates),
          'Restore failed: could not fetch existing My Bags'
        ) || [];

      await mapLimit(backup.bagTemplates, MAX_CONCURRENT_REQUESTS, async (template) => {
        const fields = {
          name: template.name,
          type: template.type,
          color: template.color,
          sort_order: template.sort_order,
        };
        const existing = existingTemplates.find(
          (t) => normalize(t.name) === normalize(template.name)
        );
        const response = existing
          ? await api.patch(endpoints.bagTemplate(existing.id), fields)
          : await api.post(endpoints.bagTemplates, fields);
        assertSuccess(response, `Restore failed: could not save My Bag "${template.name}"`);
      });
    })(),
  ]);

  // Phase 3: Trips, one at a time (each fans out internally).
  const existingTrips =
    assertSuccess(
      await api.get<Trip[]>(endpoints.trips),
      'Restore failed: could not fetch existing trips'
    ) || [];

  for (const { bags, items, ...tripData } of backup.trips) {
    const fields = {
      name: tripData.name,
      destination: tripData.destination,
      start_date: tripData.start_date,
      end_date: tripData.end_date,
      notes: tripData.notes,
    };
    const existingTrip =
      existingTrips.find((t) => t.id === tripData.source_id) ||
      existingTrips.find((t) => normalize(t.name) === normalize(tripData.name));

    let tripId: string;
    if (existingTrip) {
      const response = await api.patch(endpoints.trip(existingTrip.id), fields);
      assertSuccess(response, `Restore failed: could not update trip "${tripData.name}"`);
      tripId = existingTrip.id;
    } else {
      const response = await api.post<Trip>(endpoints.trips, fields);
      tripId = assertData(response, `Restore failed: could not create trip "${tripData.name}"`).id;
    }

    try {
      const result = await restoreTripContents(
        tripId,
        { bags, items },
        { merge: !!existingTrip, api }
      );
      itemFailures.push(...result.failures.map((f) => `Trip "${tripData.name}": ${f}`));
    } catch (error) {
      throw new Error(
        `Restore failed: trip "${tripData.name}": ${error instanceof Error ? error.message : error}`
      );
    }
  }

  if (masterItemFailures.length > 0 || itemFailures.length > 0) {
    const totalItems = backup.trips.reduce((sum, t) => sum + t.items.length, 0);
    const summaryParts: string[] = [];
    if (itemFailures.length > 0) {
      summaryParts.push(`${itemFailures.length} of ${totalItems} items failed`);
    }
    if (masterItemFailures.length > 0) {
      summaryParts.push(
        `${masterItemFailures.length} of ${backup.masterItems.length} My Items failed`
      );
    }
    const details = [...masterItemFailures, ...itemFailures].join(' | ');
    throw new Error(`Restore incomplete: ${summaryParts.join('; ')}. Failures: ${details}`);
  }
}
