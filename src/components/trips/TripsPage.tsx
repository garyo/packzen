import { createSignal, createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { TripForm } from './TripForm';
import { formatDate, getTripStatus } from '../../lib/utils';
import { tripsToCSV, csvToTrips, downloadCSV } from '../../lib/csv';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';

export function TripsPage() {
  const [showForm, setShowForm] = createSignal(false);
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);

  const [trips, { refetch }] = createResource<Trip[]>(async () => {
    return fetchWithErrorHandling(() => api.get<Trip[]>(endpoints.trips), 'Failed to load trips');
  });

  onMount(async () => {
    await authStore.initAuth();
  });

  const handleCopy = async (trip: Trip) => {
    try {
      // Get all bags and items from the original trip
      const [bagsResponse, itemsResponse] = await Promise.all([
        api.get(endpoints.tripBags(trip.id)),
        api.get(endpoints.tripItems(trip.id)),
      ]);

      const bags = bagsResponse.data || [];
      const items = itemsResponse.data || [];

      // Create new trip with "Copy" appended to name
      const newTripResponse = await api.post(endpoints.trips, {
        name: `${trip.name} (Copy)`,
        destination: trip.destination,
        start_date: trip.start_date,
        end_date: trip.end_date,
        notes: trip.notes,
      });

      if (!newTripResponse.success || !newTripResponse.data) {
        showToast('error', 'Failed to create new trip');
        return;
      }

      const newTripId = newTripResponse.data.id;

      // Copy bags and create a mapping of old bag IDs to new bag IDs
      const bagIdMap = new Map<string, string>();
      for (const bag of bags) {
        const newBagResponse = await api.post(endpoints.tripBags(newTripId), {
          name: bag.name,
          color: bag.color,
        });
        if (newBagResponse.success && newBagResponse.data) {
          bagIdMap.set(bag.id, newBagResponse.data.id);
        }
      }

      // Copy items with updated bag IDs
      for (const item of items) {
        const newBagId = item.bag_id ? bagIdMap.get(item.bag_id) || null : null;
        await api.post(endpoints.tripItems(newTripId), {
          name: item.name,
          category_name: item.category_name,
          quantity: item.quantity,
          bag_id: newBagId,
          master_item_id: item.master_item_id,
        });
      }

      showToast('success', `Created copy of "${trip.name}"`);
      refetch();
    } catch (error) {
      showToast('error', 'Failed to copy trip');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip? All items and bags will be deleted.')) return;

    const response = await api.delete(endpoints.trip(id));
    if (response.success) {
      showToast('success', 'Trip deleted');
      refetch();
    } else {
      showToast('error', response.error || 'Failed to delete trip');
    }
  };

  const handleExport = () => {
    const tripsList = trips();
    if (!tripsList || tripsList.length === 0) {
      showToast('error', 'No trips to export');
      return;
    }

    const csv = tripsToCSV(tripsList);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`trips-${timestamp}.csv`, csv);
    showToast('success', 'Trips exported');
  };

  const handleImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedTrips = csvToTrips(text);
      const existingTrips = trips() || [];

      let createdCount = 0;
      let updatedCount = 0;

      for (const trip of parsedTrips) {
        // Check if trip with same name exists (case-insensitive)
        const existing = existingTrips.find(
          (e) => e.name.toLowerCase() === trip.name.toLowerCase()
        );

        if (existing) {
          // Update existing trip
          const response = await api.put(endpoints.trip(existing.id), {
            ...existing,
            destination: trip.destination || existing.destination,
            start_date: trip.start_date || existing.start_date,
            end_date: trip.end_date || existing.end_date,
            notes: trip.notes || existing.notes,
          });
          if (response.success) {
            updatedCount++;
          }
        } else {
          // Create new trip
          const response = await api.post(endpoints.trips, trip);
          if (response.success) {
            createdCount++;
          }
        }
      }

      showToast('success', `Imported: ${createdCount} created, ${updatedCount} updated`);
      refetch();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      input.value = ''; // Reset file input
    }
  };

  const upcomingTrips = () =>
    trips()?.filter(
      (t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
    ) || [];
  const activeTrips = () =>
    trips()?.filter(
      (t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'active'
    ) || [];
  const pastTrips = () =>
    trips()?.filter(
      (t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'past'
    ) || [];

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a
                href="/dashboard"
                class="flex items-center gap-1 text-gray-600 hover:text-gray-900"
              >
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
              <div>
                <h1 class="text-2xl font-bold text-gray-900">My Trips</h1>
                <p class="text-sm text-gray-600">Plan and pack for your adventures</p>
              </div>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleExport}>
                Export
              </Button>
              <label class="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none">
                Import
                <input type="file" accept=".csv" onChange={handleImport} class="hidden" />
              </label>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTrip(null);
                  setShowForm(true);
                }}
              >
                + New Trip
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main class="container mx-auto px-4 py-6">
        <Show when={!trips.loading} fallback={<LoadingSpinner text="Loading trips..." />}>
          <Show
            when={(trips()?.length || 0) > 0}
            fallback={
              <EmptyState
                icon="🧳"
                title="No trips yet"
                description="Create your first trip and start planning your packing list"
                action={<Button onClick={() => setShowForm(true)}>Create Your First Trip</Button>}
              />
            }
          >
            <div class="space-y-8">
              {/* Active Trips */}
              <Show when={activeTrips().length > 0}>
                <div>
                  <h2 class="mb-3 text-lg font-semibold text-gray-900">Active Trips</h2>
                  <div class="grid gap-4 md:grid-cols-2">
                    <For each={activeTrips()}>
                      {(trip) => (
                        <TripCard
                          trip={trip}
                          onCopy={() => handleCopy(trip)}
                          onDelete={() => handleDelete(trip.id)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Upcoming Trips */}
              <Show when={upcomingTrips().length > 0}>
                <div>
                  <h2 class="mb-3 text-lg font-semibold text-gray-900">Upcoming Trips</h2>
                  <div class="grid gap-4 md:grid-cols-2">
                    <For each={upcomingTrips()}>
                      {(trip) => (
                        <TripCard
                          trip={trip}
                          onCopy={() => handleCopy(trip)}
                          onDelete={() => handleDelete(trip.id)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Past Trips */}
              <Show when={pastTrips().length > 0}>
                <div>
                  <h2 class="mb-3 text-lg font-semibold text-gray-900">Past Trips</h2>
                  <div class="grid gap-4 md:grid-cols-2">
                    <For each={pastTrips()}>
                      {(trip) => (
                        <TripCard
                          trip={trip}
                          onCopy={() => handleCopy(trip)}
                          onDelete={() => handleDelete(trip.id)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </main>

      <Show when={showForm()}>
        <TripForm
          trip={editingTrip()}
          onClose={() => {
            setShowForm(false);
            setEditingTrip(null);
          }}
          onSaved={() => {
            setShowForm(false);
            refetch();
          }}
        />
      </Show>

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

function TripCard(props: { trip: Trip; onCopy: () => void; onDelete: () => void }) {
  const statusColors = {
    upcoming: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    past: 'bg-gray-100 text-gray-800',
  };

  const status = () =>
    props.trip.start_date
      ? getTripStatus(props.trip.start_date, props.trip.end_date || props.trip.start_date)
      : 'upcoming';

  return (
    <div class="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
      <div class="mb-3 flex items-start justify-between">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900">{props.trip.name}</h3>
          {props.trip.destination && (
            <p class="mt-1 text-sm text-gray-600">📍 {props.trip.destination}</p>
          )}
        </div>
        <span class={`rounded px-2 py-1 text-xs font-medium ${statusColors[status()]}`}>
          {status()}
        </span>
      </div>

      {props.trip.start_date && (
        <p class="mb-4 text-sm text-gray-600">
          {formatDate(props.trip.start_date)}
          {props.trip.end_date && ` - ${formatDate(props.trip.end_date)}`}
        </p>
      )}

      <div class="flex gap-2">
        <a
          href={`/trips/${props.trip.id}/pack`}
          class="flex-1 rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Pack
        </a>
        <button
          onClick={props.onCopy}
          class="px-3 py-2 text-sm text-gray-600 hover:text-blue-600"
          title="Copy this trip"
        >
          Copy
        </button>
        <button onClick={props.onDelete} class="px-3 py-2 text-sm text-gray-600 hover:text-red-600">
          Delete
        </button>
      </div>
    </div>
  );
}
