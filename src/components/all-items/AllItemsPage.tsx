import { createSignal, createResource, For, Show, onMount, onCleanup } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Category, MasterItem } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { ItemForm } from './ItemForm';
import { CategoryManager } from './CategoryManager';
import { masterItemsToCSV, csvToMasterItems, downloadCSV } from '../../lib/csv';
import { fullBackupToYAML, yamlToFullBackup, downloadYAML } from '../../lib/yaml';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';
import type { Trip, Bag, TripItem } from '../../lib/types';

export function AllItemsPage() {
  const [showItemForm, setShowItemForm] = createSignal(false);
  const [showCategoryManager, setShowCategoryManager] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<MasterItem | null>(null);
  const [showBackupMenu, setShowBackupMenu] = createSignal(false);
  let backupMenuRef: HTMLDivElement | undefined;

  // Fetch categories
  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  // Fetch all items
  const [items, { refetch: refetchItems }] = createResource<MasterItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItem[]>(endpoints.masterItems),
      'Failed to load items'
    );
  });

  // Initialize auth on mount
  onMount(async () => {
    await authStore.initAuth();
  });

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showBackupMenu() && backupMenuRef && !backupMenuRef.contains(e.target as Node)) {
        setShowBackupMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showBackupMenu()) {
        setShowBackupMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  const handleAddItem = () => {
    setEditingItem(null);
    setShowItemForm(true);
  };

  const handleEditItem = (item: MasterItem) => {
    setEditingItem(item);
    setShowItemForm(true);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const response = await api.delete(endpoints.masterItem(id));
    if (response.success) {
      showToast('success', 'Item deleted successfully');
      refetchItems();
    } else {
      showToast('error', response.error || 'Failed to delete item');
    }
  };

  const handleItemSaved = () => {
    setShowItemForm(false);
    setEditingItem(null);
    refetchItems();
  };

  const handleExport = () => {
    const itemsList = items();
    if (!itemsList || itemsList.length === 0) {
      showToast('error', 'No items to export');
      return;
    }

    const csv = masterItemsToCSV(itemsList);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`all-items-${timestamp}.csv`, csv);
    showToast('success', 'All items exported');
  };

  const handleImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedItems = csvToMasterItems(text);
      const existingItems = items() || [];
      const existingCategories = categories() || [];

      let createdCount = 0;
      let updatedCount = 0;
      let createdCategoriesCount = 0;

      // Helper to get or create category by name
      const getCategoryId = async (categoryName: string | undefined): Promise<string | null> => {
        if (!categoryName) return null;

        // Check if category exists (case-insensitive)
        let category = existingCategories.find(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase()
        );

        // Create category if it doesn't exist
        if (!category) {
          const response = await api.post(endpoints.categories, { name: categoryName });
          if (response.success && response.data) {
            category = response.data;
            existingCategories.push(category);
            createdCategoriesCount++;
          }
        }

        return category?.id || null;
      };

      for (const item of parsedItems) {
        // Get or create category
        const category_id = await getCategoryId(item.category_name);

        // Check if item with same name exists (case-insensitive)
        const existing = existingItems.find(
          (e) => e.name.toLowerCase() === item.name.toLowerCase()
        );

        if (existing) {
          // Update existing item
          const response = await api.put(endpoints.masterItem(existing.id), {
            name: existing.name,
            description: item.description || existing.description,
            category_id: category_id || existing.category_id,
            default_quantity: item.default_quantity,
          });
          if (response.success) {
            updatedCount++;
          }
        } else {
          // Create new item
          const response = await api.post(endpoints.masterItems, {
            name: item.name,
            description: item.description,
            category_id,
            default_quantity: item.default_quantity,
          });
          if (response.success) {
            createdCount++;
          }
        }
      }

      let message = `Imported: ${createdCount} items created, ${updatedCount} updated`;
      if (createdCategoriesCount > 0) {
        message += `, ${createdCategoriesCount} categories created`;
      }
      showToast('success', message);

      refetchItems();
      refetchCategories();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      input.value = ''; // Reset file input
    }
  };

  const handleFullBackupExport = async () => {
    try {
      // Fetch all data
      const categoriesList = categories() || [];
      const itemsList = items() || [];

      // Fetch all trips
      const tripsResponse = await api.get<Trip[]>(endpoints.trips);
      const tripsList = tripsResponse.data || [];

      // Fetch bags and items for each trip
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

      const yamlContent = fullBackupToYAML(categoriesList, itemsList, tripsWithData);
      const filename = `packzen-backup-${new Date().toISOString().split('T')[0]}.yaml`;
      downloadYAML(yamlContent, filename);
      showToast('success', 'Full backup exported successfully');
      setShowBackupMenu(false);
    } catch (error) {
      showToast('error', 'Failed to export backup');
      console.error(error);
    }
  };

  const handleFullBackupImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!confirm('This will merge the backup with your existing data. Matching items will be updated, and new items will be added. Continue?')) {
      input.value = '';
      return;
    }

    try {
      const text = await file.text();
      const backup = yamlToFullBackup(text);

      // Create a map to track created categories
      const categoryNameToId = new Map<string, string>();

      // Import categories
      for (const cat of backup.categories) {
        const existing = categories()?.find((c) => c.name === cat.name);
        if (existing) {
          // Update existing category with new icon/sort_order
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

        const existing = items()?.find(
          (i) => i.name.toLowerCase() === item.name.toLowerCase()
        );

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

      // Import trips
      // First, get all existing trips
      const tripsResponse = await api.get<Trip[]>(endpoints.trips);
      const existingTrips = tripsResponse.data || [];

      for (const tripData of backup.trips) {
        // Check if trip with same name exists (case-insensitive)
        const existingTrip = existingTrips.find(
          (t) => t.name.toLowerCase() === tripData.name.toLowerCase()
        );

        let tripId: string;

        if (existingTrip) {
          // Update existing trip
          await api.patch(endpoints.trip(existingTrip.id), {
            name: tripData.name,
            destination: tripData.destination,
            start_date: tripData.start_date,
            end_date: tripData.end_date,
            notes: tripData.notes,
          });
          tripId = existingTrip.id;
        } else {
          // Create new trip
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

        // Get existing bags for this trip
        const bagsResponse = await api.get<Bag[]>(endpoints.tripBags(tripId));
        const existingBags = bagsResponse.data || [];

        // Create or update bags and map names to IDs
        const bagNameToId = new Map<string, string>();
        for (const bagData of tripData.bags) {
          const existingBag = existingBags.find((b) => b.name === bagData.name);
          if (existingBag) {
            // Update existing bag
            await api.patch(endpoints.tripBags(tripId), {
              bag_id: existingBag.id,
              name: bagData.name,
              type: bagData.type,
              color: bagData.color,
            });
            bagNameToId.set(bagData.name, existingBag.id);
          } else {
            // Create new bag
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

        // Get existing items for this trip
        const itemsResponse = await api.get<TripItem[]>(endpoints.tripItems(tripId));
        const existingItems = itemsResponse.data || [];

        // Create or update items
        for (const itemData of tripData.items) {
          const bagId = itemData.bag_name ? bagNameToId.get(itemData.bag_name) || null : null;
          const existingItem = existingItems.find(
            (i) => i.name.toLowerCase() === itemData.name.toLowerCase()
          );

          if (existingItem) {
            // Update existing item
            await api.patch(endpoints.tripItems(tripId), {
              id: existingItem.id,
              name: itemData.name,
              category_name: itemData.category_name,
              quantity: itemData.quantity,
              bag_id: bagId,
            });
          } else {
            // Create new item
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
      refetchCategories();
      refetchItems();
      setShowBackupMenu(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to restore backup');
      console.error(error);
    } finally {
      input.value = '';
    }
  };

  const getItemsByCategory = (categoryId: string | null) => {
    return items()?.filter((item) => item.category_id === categoryId) || [];
  };

  const uncategorizedItems = () => getItemsByCategory(null);

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      {/* Header */}
      <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div class="container mx-auto px-4 py-4 md:py-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4 md:gap-2">
              <a
                href="/dashboard"
                class="flex items-center gap-1 text-gray-600 hover:text-gray-900"
              >
                <svg class="h-5 w-5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
              <div>
                <h1 class="text-2xl md:text-lg font-bold text-gray-900">All Items</h1>
                <p class="text-sm md:text-xs text-gray-600">Your reusable packing essentials</p>
              </div>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCategoryManager(true)}>
                Categories
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport}>
                Export
              </Button>
              <label class="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none">
                Import
                <input type="file" accept=".csv" onChange={handleImport} class="hidden" />
              </label>
              <div class="relative" ref={backupMenuRef}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowBackupMenu(!showBackupMenu())}
                >
                  Backup
                </Button>
                <Show when={showBackupMenu()}>
                  <div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                    <button
                      onClick={handleFullBackupExport}
                      class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      Export Full Backup
                    </button>
                    <label class="block w-full cursor-pointer px-4 py-2 text-left text-sm hover:bg-gray-100">
                      Restore from Backup
                      <input
                        type="file"
                        accept=".yaml,.yml"
                        onChange={handleFullBackupImport}
                        class="hidden"
                      />
                    </label>
                  </div>
                </Show>
              </div>
              <Button size="sm" onClick={handleAddItem}>
                + Add Item
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="container mx-auto px-4 py-6 md:px-3 md:py-3">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={(items()?.length || 0) > 0}
            fallback={
              <EmptyState
                icon="📝"
                title="No items yet"
                description="Start building your packing list by adding your first item"
                action={<Button onClick={handleAddItem}>Add Your First Item</Button>}
              />
            }
          >
            <div class="space-y-6 md:space-y-3">
              {/* Categories */}
              <For each={categories()}>
                {(category) => {
                  const categoryItems = () => getItemsByCategory(category.id);
                  return (
                    <Show when={categoryItems().length > 0}>
                      <div class="rounded-lg bg-white p-4 md:p-2 shadow-sm">
                        <div class="mb-4 md:mb-2 flex items-center gap-2">
                          <span class="text-2xl md:text-xl">{category.icon || '📦'}</span>
                          <h2 class="text-lg md:text-base font-semibold text-gray-900">{category.name}</h2>
                          <span class="text-sm md:text-xs text-gray-500">({categoryItems().length})</span>
                        </div>
                        <div class="grid grid-cols-1 gap-3 md:gap-2 md:grid-cols-2 lg:grid-cols-3">
                          <For each={categoryItems()}>
                            {(item) => (
                              <div
                                class="rounded-lg border border-gray-200 p-3 md:p-2 transition-colors hover:border-blue-500 cursor-pointer"
                                onClick={() => handleEditItem(item)}
                              >
                                <div class="flex items-start justify-between">
                                  <div class="flex-1">
                                    <h3 class="font-medium md:text-sm text-gray-900">{item.name}</h3>
                                    {item.description && (
                                      <p class="mt-1 md:mt-0.5 text-sm md:text-xs text-gray-600">{item.description}</p>
                                    )}
                                    <p class="mt-1 md:mt-0.5 text-xs text-gray-500">
                                      Qty: {item.default_quantity}
                                    </p>
                                  </div>
                                  <div class="ml-2 flex gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteItem(item.id);
                                      }}
                                      class="p-1 text-gray-400 hover:text-red-600"
                                      aria-label="Delete"
                                    >
                                      <svg
                                        class="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                          stroke-width="2"
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  );
                }}
              </For>

              {/* Uncategorized */}
              <Show when={uncategorizedItems().length > 0}>
                <div class="rounded-lg bg-white p-4 md:p-2 shadow-sm">
                  <h2 class="mb-4 md:mb-2 text-lg md:text-base font-semibold text-gray-900">
                    Uncategorized ({uncategorizedItems().length})
                  </h2>
                  <div class="grid grid-cols-1 gap-3 md:gap-2 md:grid-cols-2 lg:grid-cols-3">
                    <For each={uncategorizedItems()}>
                      {(item) => (
                        <div
                          class="rounded-lg border border-gray-200 p-3 md:p-2 transition-colors hover:border-blue-500 cursor-pointer"
                          onClick={() => handleEditItem(item)}
                        >
                          <div class="flex items-start justify-between">
                            <div class="flex-1">
                              <h3 class="font-medium md:text-sm text-gray-900">{item.name}</h3>
                              {item.description && (
                                <p class="mt-1 md:mt-0.5 text-sm md:text-xs text-gray-600">{item.description}</p>
                              )}
                              <p class="mt-1 md:mt-0.5 text-xs text-gray-500">Qty: {item.default_quantity}</p>
                            </div>
                            <div class="ml-2 flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteItem(item.id);
                                }}
                                class="p-1 text-gray-400 hover:text-red-600"
                                aria-label="Delete"
                              >
                                <svg
                                  class="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </main>

      {/* Modals */}
      <Show when={showItemForm()}>
        <ItemForm
          item={editingItem()}
          categories={categories() || []}
          onClose={() => {
            setShowItemForm(false);
            setEditingItem(null);
          }}
          onSaved={handleItemSaved}
        />
      </Show>

      <Show when={showCategoryManager()}>
        <CategoryManager
          categories={categories() || []}
          onClose={() => setShowCategoryManager(false)}
          onSaved={() => {
            refetchCategories();
            refetchItems();
          }}
        />
      </Show>

      {/* Back Button */}
      <div class="fixed bottom-4 left-4">
        <a
          href="/dashboard"
          class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 shadow-md hover:bg-gray-50"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </a>
      </div>
    </div>
  );
}
