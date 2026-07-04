import type { Category, MasterItem, BagTemplate, Trip, TripItem, Bag, ApiResponse } from './types';
import { api as defaultApi, endpoints } from './api';
import { fullBackupToYAML, yamlToFullBackup } from './yaml';

interface TripWithData {
  trip: Trip;
  bags: Bag[];
  items: TripItem[];
}

type ApiClient = typeof defaultApi;

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
    assertSuccess(bagTemplatesResponse, 'Backup failed: could not fetch bag templates') || [];
  const tripsList = assertSuccess(tripsResponse, 'Backup failed: could not fetch trips') || [];

  const tripsWithData: TripWithData[] = await Promise.all(
    tripsList.map(async (trip) => {
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
    })
  );

  const yamlContent = fullBackupToYAML(categories, masterItems, bagTemplatesList, tripsWithData);
  const filename = `packzen-backup-${new Date().toISOString().split('T')[0]}.yaml`;
  return { yaml: yamlContent, filename };
}

export async function restoreBackupData(
  yamlText: string,
  currentCategories: Category[],
  currentMasterItems: MasterItem[],
  api: ApiClient = defaultApi
): Promise<void> {
  const backup = yamlToFullBackup(yamlText);
  const categoryNameToId = new Map<string, string>();

  // Failures that don't corrupt dependent data are collected and reported at
  // the end, rather than aborting the whole restore.
  const masterItemFailures: string[] = [];
  const itemFailures: string[] = [];
  const containerLinkFailures: string[] = [];

  // Phase 1: Categories (must complete before master items, since items reference category IDs)
  // Category failures are structural (master items depend on the resulting
  // IDs), so any failure aborts the restore immediately.
  await Promise.all(
    backup.categories.map(async (category) => {
      const existing = currentCategories.find(
        (c) => normalize(c.name) === normalize(category.name)
      );
      if (existing) {
        const response = await api.patch(endpoints.category(existing.id), {
          name: category.name,
          icon: category.icon,
          sort_order: category.sort_order,
        });
        if (!response.success) {
          throw new Error(
            `Restore failed: could not update category "${category.name}" (${response.error})`
          );
        }
        categoryNameToId.set(normalize(category.name), existing.id);
      } else {
        const response = await api.post<Category>(endpoints.categories, {
          name: category.name,
          icon: category.icon,
          sort_order: category.sort_order,
        });
        const data = assertData(
          response,
          `Restore failed: could not create category "${category.name}"`
        );
        categoryNameToId.set(normalize(category.name), data.id);
      }
    })
  );

  // Phase 2: Master items + bag templates (independent, run in parallel)
  await Promise.all([
    // Master items (depend on categoryNameToId from phase 1). A failed master
    // item doesn't corrupt anything else, so failures are collected instead
    // of aborting the restore.
    Promise.all(
      backup.masterItems.map(async (item) => {
        const categoryId = item.category_name
          ? categoryNameToId.get(normalize(item.category_name)) || null
          : null;
        const existing = currentMasterItems.find((i) => normalize(i.name) === normalize(item.name));

        const payload = {
          name: item.name,
          description: item.description,
          category_id: categoryId,
          default_quantity: item.default_quantity,
          is_container: item.is_container,
        };

        const response = existing
          ? await api.patch(endpoints.masterItem(existing.id), payload)
          : await api.post(endpoints.masterItems, payload);

        if (!response.success) {
          masterItemFailures.push(`Master item "${item.name}": ${response.error}`);
        }
      })
    ),
    // Bag templates (fully independent). Structural: dependents (none today,
    // but treated consistently with categories/trips/bags) abort on failure.
    (async () => {
      const bagTemplatesResponse = await api.get<BagTemplate[]>(endpoints.bagTemplates);
      const existingBagTemplates =
        assertSuccess(
          bagTemplatesResponse,
          'Restore failed: could not fetch existing bag templates'
        ) || [];

      await Promise.all(
        backup.bagTemplates.map(async (template) => {
          const existingTemplate = existingBagTemplates.find(
            (t) => normalize(t.name) === normalize(template.name)
          );

          if (existingTemplate) {
            const response = await api.patch(endpoints.bagTemplate(existingTemplate.id), {
              name: template.name,
              type: template.type,
              color: template.color,
              sort_order: template.sort_order,
            });
            if (!response.success) {
              throw new Error(
                `Restore failed: could not update bag template "${template.name}" (${response.error})`
              );
            }
          } else {
            const response = await api.post(endpoints.bagTemplates, {
              name: template.name,
              type: template.type,
              color: template.color,
              sort_order: template.sort_order,
            });
            if (!response.success) {
              throw new Error(
                `Restore failed: could not create bag template "${template.name}" (${response.error})`
              );
            }
          }
        })
      );
    })(),
  ]);

  // Phase 3: Trips (each trip is sequential internally, but trips are independent)
  const tripsResponse = await api.get<Trip[]>(endpoints.trips);
  const existingTrips =
    assertSuccess(tripsResponse, 'Restore failed: could not fetch existing trips') || [];

  await Promise.all(
    backup.trips.map(async (tripData) => {
      const existingTrip =
        existingTrips.find((t) => t.id === tripData.source_id) ||
        existingTrips.find((t) => normalize(t.name) === normalize(tripData.name));

      let tripId: string;

      if (existingTrip) {
        const response = await api.patch(endpoints.trip(existingTrip.id), {
          name: tripData.name,
          destination: tripData.destination,
          start_date: tripData.start_date,
          end_date: tripData.end_date,
          notes: tripData.notes,
        });
        if (!response.success) {
          throw new Error(
            `Restore failed: could not update trip "${tripData.name}" (${response.error})`
          );
        }
        tripId = existingTrip.id;
      } else {
        const tripResponse = await api.post<Trip>(endpoints.trips, {
          name: tripData.name,
          destination: tripData.destination,
          start_date: tripData.start_date,
          end_date: tripData.end_date,
          notes: tripData.notes,
        });
        tripId = assertData(
          tripResponse,
          `Restore failed: could not create trip "${tripData.name}"`
        ).id;
      }

      // Fetch existing bags/items in parallel
      const [bagsResponse, itemsResponse] = await Promise.all([
        api.get<Bag[]>(endpoints.tripBags(tripId)),
        api.get<TripItem[]>(endpoints.tripItems(tripId)),
      ]);
      const existingBags =
        assertSuccess(
          bagsResponse,
          `Restore failed: could not fetch bags for trip "${tripData.name}"`
        ) || [];
      const bagNameToId = new Map<string, string>();
      const bagSourceMap = new Map<string, string>();

      const rememberBag = (bagData: (typeof tripData.bags)[number], id: string) => {
        bagNameToId.set(normalize(bagData.name), id);
        if (bagData.source_id) {
          bagSourceMap.set(bagData.source_id, id);
        }
      };

      // Restore bags in parallel. Bags are structural: items depend on the
      // resulting IDs, so a failure here aborts the restore.
      await Promise.all(
        tripData.bags.map(async (bagData) => {
          const existingBag =
            (bagData.source_id && existingBags.find((b) => b.id === bagData.source_id)) ||
            existingBags.find((b) => normalize(b.name) === normalize(bagData.name));

          if (existingBag) {
            const response = await api.patch(endpoints.tripBags(tripId), {
              bag_id: existingBag.id,
              name: bagData.name,
              type: bagData.type,
              color: bagData.color,
              sort_order: bagData.sort_order,
            });
            if (!response.success) {
              throw new Error(
                `Restore failed: could not update bag "${bagData.name}" in trip "${tripData.name}" (${response.error})`
              );
            }
            rememberBag(bagData, existingBag.id);
          } else {
            const bagResponse = await api.post<Bag>(endpoints.tripBags(tripId), {
              name: bagData.name,
              type: bagData.type,
              color: bagData.color,
              sort_order: bagData.sort_order,
            });
            const data = assertData(
              bagResponse,
              `Restore failed: could not create bag "${bagData.name}" in trip "${tripData.name}"`
            );
            rememberBag(bagData, data.id);
          }
        })
      );

      // Restore items in parallel (bags are done, so bag IDs are available).
      // Item failures don't corrupt other items, so they're collected and
      // reported at the end rather than aborting the restore.
      const existingItems =
        assertSuccess(
          itemsResponse,
          `Restore failed: could not fetch items for trip "${tripData.name}"`
        ) || [];
      const itemSourceMap = new Map<string, string>();
      const restoredItems: Array<{
        backupItem: (typeof tripData.items)[number];
        itemId: string;
      }> = [];

      const getItemKey = (item: (typeof tripData.items)[number]) =>
        `${normalize(item.name)}|${normalize(item.category_name)}|${normalize(item.bag_name)}`;
      const getSourceMapKey = (item: (typeof tripData.items)[number]) =>
        item.source_id || getItemKey(item);

      await Promise.all(
        tripData.items.map(async (itemData) => {
          const bagId =
            (itemData.bag_source_id && bagSourceMap.get(itemData.bag_source_id)) ||
            (itemData.bag_name ? bagNameToId.get(normalize(itemData.bag_name)) || null : null);

          const existingItem =
            (itemData.source_id && existingItems.find((i) => i.id === itemData.source_id)) ||
            existingItems.find(
              (i) =>
                normalize(i.name) === normalize(itemData.name) &&
                (i.bag_id || null) === (bagId || null) &&
                normalize(i.category_name) === normalize(itemData.category_name)
            );

          if (existingItem) {
            const response = await api.patch(endpoints.tripItems(tripId), {
              id: existingItem.id,
              name: itemData.name,
              category_name: itemData.category_name,
              quantity: itemData.quantity,
              bag_id: bagId,
              is_packed: itemData.is_packed,
              is_skipped: itemData.is_skipped ?? false,
              is_container: itemData.is_container,
              notes: itemData.notes,
            });
            if (!response.success) {
              itemFailures.push(
                `Item "${itemData.name}" in trip "${tripData.name}": ${response.error}`
              );
              return;
            }
            itemSourceMap.set(getSourceMapKey(itemData), existingItem.id);
            restoredItems.push({ backupItem: itemData, itemId: existingItem.id });
            return;
          }

          const createResponse = await api.post<TripItem>(endpoints.tripItems(tripId), {
            name: itemData.name,
            category_name: itemData.category_name,
            quantity: itemData.quantity,
            bag_id: bagId,
            master_item_id: null,
            container_item_id: null,
            is_container: itemData.is_container || false,
            is_packed: itemData.is_packed,
            is_skipped: itemData.is_skipped ?? false,
            notes: itemData.notes,
            merge_duplicates: false,
          });

          if (!createResponse.success || !createResponse.data) {
            itemFailures.push(
              `Item "${itemData.name}" in trip "${tripData.name}": ${createResponse.error || 'no data returned'}`
            );
            return;
          }

          itemSourceMap.set(getSourceMapKey(itemData), createResponse.data.id);
          restoredItems.push({ backupItem: itemData, itemId: createResponse.data.id });
        })
      );

      // Link containers in parallel (all items that could be restored exist
      // now). This covers items matched to existing rows as well as newly
      // created ones, so restoring over existing data doesn't drop nesting.
      await Promise.all(
        restoredItems
          .filter(({ backupItem }) => backupItem.container_source_id || backupItem.container_name)
          .map(async ({ backupItem, itemId }) => {
            const parentBackupItem = backupItem.container_name
              ? tripData.items.find(
                  (i) => normalize(i.name) === normalize(backupItem.container_name)
                )
              : undefined;

            const parentId =
              (backupItem.container_source_id &&
                itemSourceMap.get(backupItem.container_source_id)) ||
              (parentBackupItem ? itemSourceMap.get(getSourceMapKey(parentBackupItem)) : undefined);

            if (!parentId) {
              containerLinkFailures.push(
                `Item "${backupItem.name}" in trip "${tripData.name}": could not resolve container "${
                  backupItem.container_name || backupItem.container_source_id
                }"`
              );
              return;
            }

            const response = await api.patch(endpoints.tripItems(tripId), {
              id: itemId,
              container_item_id: parentId,
            });
            if (!response.success) {
              containerLinkFailures.push(
                `Item "${backupItem.name}" in trip "${tripData.name}": failed to link container (${response.error})`
              );
            }
          })
      );
    })
  );

  if (
    masterItemFailures.length > 0 ||
    itemFailures.length > 0 ||
    containerLinkFailures.length > 0
  ) {
    const totalItems = backup.trips.reduce((sum, t) => sum + t.items.length, 0);
    const summaryParts: string[] = [];
    if (itemFailures.length > 0) {
      summaryParts.push(`${itemFailures.length} of ${totalItems} items failed`);
    }
    if (masterItemFailures.length > 0) {
      summaryParts.push(
        `${masterItemFailures.length} of ${backup.masterItems.length} master items failed`
      );
    }
    if (containerLinkFailures.length > 0) {
      summaryParts.push(`${containerLinkFailures.length} container link(s) failed`);
    }
    const details = [...masterItemFailures, ...itemFailures, ...containerLinkFailures].join(' | ');
    throw new Error(`Restore incomplete: ${summaryParts.join('; ')}. Failures: ${details}`);
  }
}
