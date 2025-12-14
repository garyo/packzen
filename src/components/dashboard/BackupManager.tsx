/**
 * BackupManager Component
 *
 * Handles full backup export/import functionality
 * Extracted from DashboardPage for better separation of concerns
 */

import { createSignal, onMount, onCleanup, type Accessor } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Trip, MasterItem, Category, Bag, TripItem, BagTemplate } from '../../lib/types';
import { showToast } from '../ui/Toast';
import { fullBackupToYAML, yamlToFullBackup, downloadYAML } from '../../lib/yaml';

interface BackupManagerProps {
  categories: Accessor<Category[] | undefined>;
  masterItems: Accessor<MasterItem[] | undefined>;
  onBackupRestored: () => void;
}

export function BackupManager(props: BackupManagerProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showMenu()) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  const handleExport = async () => {
    try {
      const categoriesList = props.categories() || [];
      const itemsList = props.masterItems() || [];

      const bagTemplatesResponse = await api.get<BagTemplate[]>(endpoints.bagTemplates);
      const bagTemplatesList = bagTemplatesResponse.data || [];

      const tripsResponse = await api.get<Trip[]>(endpoints.trips);
      const tripsList = tripsResponse.data || [];

      const tripsWithData = await Promise.all(
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

      const yamlContent = fullBackupToYAML(categoriesList, itemsList, bagTemplatesList, tripsWithData);
      const filename = `packzen-backup-${new Date().toISOString().split('T')[0]}.yaml`;
      downloadYAML(yamlContent, filename);
      showToast('success', 'Full backup exported successfully');
      setShowMenu(false);
    } catch (error) {
      showToast('error', 'Failed to export backup');
      console.error(error);
    }
  };

  const handleImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (
      !confirm(
        'This will merge the backup with your existing data. Matching items will be updated, and new items will be added. Continue?'
      )
    ) {
      input.value = '';
      return;
    }

    try {
      const text = await file.text();
      const backup = yamlToFullBackup(text);

      const categoryNameToId = new Map<string, string>();

      // Import categories
      for (const cat of backup.categories) {
        const existing = props.categories()?.find((c) => c.name === cat.name);
        if (existing) {
          await api.patch(endpoints.category(existing.id), {
            name: cat.name,
            icon: cat.icon,
            sort_order: cat.sort_order,
          });
          categoryNameToId.set(cat.name, existing.id);
        } else {
          const response = await api.post(endpoints.categories, {
            name: cat.name,
            icon: cat.icon,
            sort_order: cat.sort_order,
          });
          if (response.data) {
            categoryNameToId.set(cat.name, response.data.id);
          }
        }
      }

      // Import master items
      for (const item of backup.masterItems) {
        const categoryId = item.category_name
          ? categoryNameToId.get(item.category_name) || null
          : null;

        const existing = props
          .masterItems()
          ?.find((i) => i.name.toLowerCase() === item.name.toLowerCase());

        if (existing) {
          await api.patch(endpoints.masterItem(existing.id), {
            name: item.name,
            description: item.description,
            category_id: categoryId,
            default_quantity: item.default_quantity,
          });
        } else {
          await api.post(endpoints.masterItems, {
            name: item.name,
            description: item.description,
            category_id: categoryId,
            default_quantity: item.default_quantity,
          });
        }
      }

      // Import bag templates
      const bagTemplatesResponse = await api.get<BagTemplate[]>(endpoints.bagTemplates);
      const existingBagTemplates = bagTemplatesResponse.data || [];

      for (const template of backup.bagTemplates) {
        const existingTemplate = existingBagTemplates.find(
          (t) => t.name.toLowerCase() === template.name.toLowerCase()
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

      // Import trips
      const tripsResponse = await api.get<Trip[]>(endpoints.trips);
      const existingTrips = tripsResponse.data || [];

      for (const tripData of backup.trips) {
        const existingTrip = existingTrips.find(
          (t) => t.name.toLowerCase() === tripData.name.toLowerCase()
        );

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
          const tripResponse = await api.post(endpoints.trips, {
            name: tripData.name,
            destination: tripData.destination,
            start_date: tripData.start_date,
            end_date: tripData.end_date,
            notes: tripData.notes,
          });
          if (!tripResponse.data) continue;
          tripId = tripResponse.data.id;
        }

        // Import bags
        const bagsResponse = await api.get<Bag[]>(endpoints.tripBags(tripId));
        const existingBags = bagsResponse.data || [];
        const bagNameToId = new Map<string, string>();

        for (const bagData of tripData.bags) {
          const existingBag = existingBags.find((b) => b.name === bagData.name);
          if (existingBag) {
            await api.patch(endpoints.tripBags(tripId), {
              bag_id: existingBag.id,
              name: bagData.name,
              type: bagData.type,
              color: bagData.color,
            });
            bagNameToId.set(bagData.name, existingBag.id);
          } else {
            const bagResponse = await api.post(endpoints.tripBags(tripId), {
              name: bagData.name,
              type: bagData.type,
              color: bagData.color,
              sort_order: bagData.sort_order,
            });
            if (bagResponse.data) {
              bagNameToId.set(bagData.name, bagResponse.data.id);
            }
          }
        }

        // Import items
        const itemsResponse = await api.get<TripItem[]>(endpoints.tripItems(tripId));
        const existingItems = itemsResponse.data || [];

        for (const itemData of tripData.items) {
          const bagId = itemData.bag_name ? bagNameToId.get(itemData.bag_name) || null : null;
          const existingItem = existingItems.find(
            (i) => i.name.toLowerCase() === itemData.name.toLowerCase()
          );

          if (existingItem) {
            await api.patch(endpoints.tripItems(tripId), {
              id: existingItem.id,
              name: itemData.name,
              category_name: itemData.category_name,
              quantity: itemData.quantity,
              bag_id: bagId,
            });
          } else {
            await api.post(endpoints.tripItems(tripId), {
              name: itemData.name,
              category_name: itemData.category_name,
              quantity: itemData.quantity,
              bag_id: bagId,
              master_item_id: null,
            });
          }
        }
      }

      showToast('success', 'Backup restored successfully!');
      props.onBackupRestored();
      setShowMenu(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to restore backup');
      console.error(error);
    } finally {
      input.value = '';
    }
  };

  return (
    <div class="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu())}
        class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Backup
      </button>

      {showMenu() && (
        <div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            onClick={handleExport}
            class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
          >
            Export Full Backup
          </button>
          <label class="block w-full cursor-pointer px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Restore from Backup
            <input
              type="file"
              accept=".yaml,.yml"
              onChange={handleImport}
              class="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
}
