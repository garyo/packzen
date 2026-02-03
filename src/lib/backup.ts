import type { Category, MasterItem, BagTemplate, Trip, TripItem, Bag } from './types';
import { api, endpoints } from './api';
import { fullBackupToYAML, yamlToFullBackup } from './yaml';

interface TripWithData {
  trip: Trip;
  bags: Bag[];
  items: TripItem[];
}

const normalize = (value?: string | null) => value?.trim().toLowerCase() || '';

export async function exportBackupData(
  categories: Category[],
  masterItems: MasterItem[]
): Promise<{ yaml: string; filename: string }> {
  const bagTemplatesResponse = await api.get<BagTemplate[]>(endpoints.bagTemplates);
  const bagTemplatesList = bagTemplatesResponse.data || [];

  const tripsResponse = await api.get<Trip[]>(endpoints.trips);
  const tripsList = tripsResponse.data || [];

  const tripsWithData: TripWithData[] = await Promise.all(
    tripsList.map(async (trip) => {
      const bagsResponse = await api.get<Bag[]>(endpoints.tripBags(trip.id));
      const itemsResponse = await api.get<TripItem[]>(endpoints.tripItems(trip.id));
      return {
        trip,
        bags: bagsResponse.data || [],
        items: itemsResponse.data || [],
      };
    })
  );

  const yamlContent = fullBackupToYAML(categories, masterItems, bagTemplatesList, tripsWithData);
  const filename = `packzen-backup-${new Date().toISOString().split('T')[0]}.yaml`;
  return { yaml: yamlContent, filename };
}

export async function restoreBackupData(
  yamlText: string,
  currentCategories: Category[],
  currentMasterItems: MasterItem[]
): Promise<void> {
  const backup = yamlToFullBackup(yamlText);
  const categoryNameToId = new Map<string, string>();

  for (const category of backup.categories) {
    const existing = currentCategories.find((c) => normalize(c.name) === normalize(category.name));
    if (existing) {
      await api.patch(endpoints.category(existing.id), {
        name: category.name,
        icon: category.icon,
        sort_order: category.sort_order,
      });
      categoryNameToId.set(normalize(category.name), existing.id);
    } else {
      const response = await api.post<Category>(endpoints.categories, {
        name: category.name,
        icon: category.icon,
        sort_order: category.sort_order,
      });
      if (response.data) {
        categoryNameToId.set(normalize(category.name), response.data.id);
      }
    }
  }

  for (const item of backup.masterItems) {
    const categoryId = item.category_name
      ? categoryNameToId.get(normalize(item.category_name)) || null
      : null;
    const existing = currentMasterItems.find((i) => normalize(i.name) === normalize(item.name));

    if (existing) {
      await api.patch(endpoints.masterItem(existing.id), {
        name: item.name,
        description: item.description,
        category_id: categoryId,
        default_quantity: item.default_quantity,
        is_container: item.is_container,
      });
    } else {
      await api.post(endpoints.masterItems, {
        name: item.name,
        description: item.description,
        category_id: categoryId,
        default_quantity: item.default_quantity,
        is_container: item.is_container,
      });
    }
  }

  const bagTemplatesResponse = await api.get<BagTemplate[]>(endpoints.bagTemplates);
  const existingBagTemplates = bagTemplatesResponse.data || [];

  for (const template of backup.bagTemplates) {
    const existingTemplate = existingBagTemplates.find(
      (t) => normalize(t.name) === normalize(template.name)
    );

    if (existingTemplate) {
      await api.patch(endpoints.bagTemplate(existingTemplate.id), {
        name: template.name,
        type: template.type,
        color: template.color,
        sort_order: template.sort_order,
      });
    } else {
      await api.post(endpoints.bagTemplates, {
        name: template.name,
        type: template.type,
        color: template.color,
        sort_order: template.sort_order,
      });
    }
  }

  const tripsResponse = await api.get<Trip[]>(endpoints.trips);
  const existingTrips = tripsResponse.data || [];

  for (const tripData of backup.trips) {
    const existingTrip =
      existingTrips.find((t) => t.id === tripData.source_id) ||
      existingTrips.find((t) => normalize(t.name) === normalize(tripData.name));

    let tripId: string;

    if (existingTrip) {
      await api.patch(endpoints.trip(existingTrip.id), {
        name: tripData.name,
        destination: tripData.destination,
        start_date: tripData.start_date,
        end_date: tripData.end_date,
        notes: tripData.notes,
      });
      tripId = existingTrip.id;
    } else {
      const tripResponse = await api.post<Trip>(endpoints.trips, {
        name: tripData.name,
        destination: tripData.destination,
        start_date: tripData.start_date,
        end_date: tripData.end_date,
        notes: tripData.notes,
      });
      if (!tripResponse.data) continue;
      tripId = tripResponse.data.id;
    }

    const bagsResponse = await api.get<Bag[]>(endpoints.tripBags(tripId));
    const existingBags = bagsResponse.data || [];
    const bagNameToId = new Map<string, string>();
    const bagSourceMap = new Map<string, string>();

    const rememberBag = (bagData: (typeof tripData.bags)[number], id: string) => {
      bagNameToId.set(normalize(bagData.name), id);
      if (bagData.source_id) {
        bagSourceMap.set(bagData.source_id, id);
      }
    };

    for (const bagData of tripData.bags) {
      const existingBag =
        (bagData.source_id && existingBags.find((b) => b.id === bagData.source_id)) ||
        existingBags.find((b) => normalize(b.name) === normalize(bagData.name));

      if (existingBag) {
        await api.patch(endpoints.tripBags(tripId), {
          bag_id: existingBag.id,
          name: bagData.name,
          type: bagData.type,
          color: bagData.color,
        });
        rememberBag(bagData, existingBag.id);
      } else {
        const bagResponse = await api.post<Bag>(endpoints.tripBags(tripId), {
          name: bagData.name,
          type: bagData.type,
          color: bagData.color,
          sort_order: bagData.sort_order,
        });
        if (bagResponse.data) {
          rememberBag(bagData, bagResponse.data.id);
        }
      }
    }

    const itemsResponse = await api.get<TripItem[]>(endpoints.tripItems(tripId));
    const existingItems = itemsResponse.data || [];
    const itemSourceMap = new Map<string, string>();
    const createdItems: Array<{ backupItem: (typeof tripData.items)[number]; newId: string }> = [];

    const getItemKey = (item: (typeof tripData.items)[number]) =>
      `${normalize(item.name)}|${normalize(item.category_name)}|${normalize(item.bag_name)}`;

    for (const itemData of tripData.items) {
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
        await api.patch(endpoints.tripItems(tripId), {
          id: existingItem.id,
          name: itemData.name,
          category_name: itemData.category_name,
          quantity: itemData.quantity,
          bag_id: bagId,
          is_packed: itemData.is_packed,
          is_container: itemData.is_container,
          notes: itemData.notes,
        });
        itemSourceMap.set(itemData.source_id || getItemKey(itemData), existingItem.id);
        continue;
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
        notes: itemData.notes,
        merge_duplicates: false,
      });

      if (createResponse.data) {
        createdItems.push({ backupItem: itemData, newId: createResponse.data.id });
        itemSourceMap.set(itemData.source_id || getItemKey(itemData), createResponse.data.id);
      }
    }

    for (const { backupItem, newId } of createdItems) {
      const parentId =
        (backupItem.container_source_id && itemSourceMap.get(backupItem.container_source_id)) ||
        (backupItem.container_name
          ? itemSourceMap.get(
              tripData.items.find((i) => normalize(i.name) === normalize(backupItem.container_name))
                ?.source_id || ''
            )
          : undefined);

      if (parentId) {
        await api.patch(endpoints.tripItems(tripId), {
          id: newId,
          container_item_id: parentId,
        });
      }
    }
  }
}
