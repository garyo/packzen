import { createSignal, createResource, For, Show, onMount, onCleanup } from 'solid-js';
import { authStore } from '../stores/auth';
import { api, endpoints } from '../lib/api';
import type { Trip, MasterItem, Category, Bag, TripItem } from '../lib/types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Toast, showToast } from './ui/Toast';
import { formatDate, getTripStatus } from '../lib/utils';
import { fetchWithErrorHandling } from '../lib/resource-helpers';
import { fullBackupToYAML, yamlToFullBackup, downloadYAML } from '../lib/yaml';

export function DashboardPage() {
  const [showBackupMenu, setShowBackupMenu] = createSignal(false);
  let backupMenuRef: HTMLDivElement | undefined;

  const [masterItems, { refetch: refetchItems }] = createResource<MasterItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItem[]>(endpoints.masterItems),
      'Failed to load items'
    );
  });

  const [trips, { refetch: refetchTrips }] = createResource<Trip[]>(async () => {
    return fetchWithErrorHandling(() => api.get<Trip[]>(endpoints.trips), 'Failed to load trips');
  });

  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

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

  const upcomingTrips = () => {
    const allTrips = trips() || [];
    return allTrips
      .filter(
        (t) =>
          t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
      )
      .sort((a, b) => {
        if (!a.start_date || !b.start_date) return 0;
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      })
      .slice(0, 2);
  };

  const upcomingTripsCount = () => {
    const allTrips = trips() || [];
    return allTrips.filter(
      (t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
    ).length;
  };

  const handleSignOut = async () => {
    await authStore.signOut();
  };

  const handleFullBackupExport = async () => {
    try {
      // Fetch all data
      const categoriesList = categories() || [];
      const itemsList = masterItems() || [];

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

        const existing = masterItems()?.find(
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
      refetchTrips();
      setShowBackupMenu(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to restore backup');
      console.error(error);
    } finally {
      input.value = '';
    }
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      {/* Header */}
      <header class="border-b border-gray-200 bg-white">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-2xl">🧳</span>
              <h1 class="text-2xl font-bold text-gray-900">PackZen</h1>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative" ref={backupMenuRef}>
                <button
                  onClick={() => setShowBackupMenu(!showBackupMenu())}
                  class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Backup
                </button>
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
              <button
                onClick={handleSignOut}
                class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="container mx-auto px-4 py-8">
        <Show
          when={!masterItems.loading && !trips.loading && !categories.loading}
          fallback={<LoadingSpinner text="Loading dashboard..." />}
        >
          <div class="mb-8">
            <h2 class="mb-2 text-3xl font-bold text-gray-900">Welcome back!</h2>
            <p class="text-gray-600">Manage your packing lists and trips</p>
          </div>

          {/* Upcoming Trips */}
          <Show when={upcomingTrips().length > 0}>
            <div class="mb-8">
              <h3 class="mb-4 text-xl font-semibold text-gray-900">Upcoming Trips</h3>
              <div class="grid gap-4 md:grid-cols-2">
                <For each={upcomingTrips()}>
                  {(trip) => (
                    <div class="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
                      <div class="mb-3 flex items-start justify-between">
                        <div class="flex-1">
                          <h4 class="text-lg font-semibold text-gray-900">{trip.name}</h4>
                          {trip.destination && (
                            <p class="mt-1 text-sm text-gray-600">📍 {trip.destination}</p>
                          )}
                        </div>
                        <span class="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          upcoming
                        </span>
                      </div>
                      {trip.start_date && (
                        <p class="mb-4 text-sm text-gray-600">
                          {formatDate(trip.start_date)}
                          {trip.end_date && ` - ${formatDate(trip.end_date)}`}
                        </p>
                      )}
                      <a
                        href={`/trips/${trip.id}/pack`}
                        class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Start Packing →
                      </a>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="grid gap-6 md:grid-cols-2">
            {/* All Items Card */}
            <div class="rounded-lg bg-white p-6 shadow-md">
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-xl font-semibold text-gray-900">All Items</h3>
                <span class="text-3xl">📝</span>
              </div>
              <p class="mb-4 text-gray-600">
                Your reusable packing list with all your essentials organized by category.
              </p>
              <a
                href="/all-items"
                class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Manage Items →
              </a>
            </div>

            {/* Trips Card */}
            <div class="rounded-lg bg-white p-6 shadow-md">
              <div class="mb-4 flex items-center justify-between">
                <h3 class="text-xl font-semibold text-gray-900">My Trips</h3>
                <span class="text-3xl">🧳</span>
              </div>
              <p class="mb-4 text-gray-600">
                Create and manage trip-specific packing lists with bag organization.
              </p>
              <a
                href="/trips"
                class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                View Trips →
              </a>
            </div>
          </div>

          {/* Quick Stats */}
          <div class="mt-8 rounded-lg bg-white p-6 shadow-md">
            <h3 class="mb-4 text-lg font-semibold text-gray-900">Quick Stats</h3>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div>
                <div class="text-3xl font-bold text-blue-600">{masterItems()?.length || 0}</div>
                <div class="text-sm text-gray-600">All Items</div>
              </div>
              <div>
                <div class="text-3xl font-bold text-green-600">{upcomingTripsCount()}</div>
                <div class="text-sm text-gray-600">Upcoming Trips</div>
              </div>
              <div>
                <div class="text-3xl font-bold text-purple-600">{categories()?.length || 0}</div>
                <div class="text-sm text-gray-600">Categories</div>
              </div>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}
