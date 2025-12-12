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

export function TripsPage() {
  const [showForm, setShowForm] = createSignal(false);
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);

  const [trips, { refetch }] = createResource<Trip[]>(async () => {
    const response = await api.get<Trip[]>(endpoints.trips);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  onMount(async () => {
    await authStore.initAuth();
  });

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

      showToast(
        'success',
        `Imported: ${createdCount} created, ${updatedCount} updated`
      );
      refetch();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      input.value = ''; // Reset file input
    }
  };

  const upcomingTrips = () => trips()?.filter((t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming') || [];
  const activeTrips = () => trips()?.filter((t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'active') || [];
  const pastTrips = () => trips()?.filter((t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'past') || [];

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a
                href="/dashboard"
                class="text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
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
              <label class="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 px-3 py-1.5 text-sm bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 cursor-pointer">
                Import
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  class="hidden"
                />
              </label>
              <Button size="sm" onClick={() => {
                setEditingTrip(null);
                setShowForm(true);
              }}>
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
                  <h2 class="text-lg font-semibold text-gray-900 mb-3">Active Trips</h2>
                  <div class="grid md:grid-cols-2 gap-4">
                    <For each={activeTrips()}>
                      {(trip) => (
                        <TripCard trip={trip} onDelete={() => handleDelete(trip.id)} />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Upcoming Trips */}
              <Show when={upcomingTrips().length > 0}>
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 mb-3">Upcoming Trips</h2>
                  <div class="grid md:grid-cols-2 gap-4">
                    <For each={upcomingTrips()}>
                      {(trip) => (
                        <TripCard trip={trip} onDelete={() => handleDelete(trip.id)} />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Past Trips */}
              <Show when={pastTrips().length > 0}>
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 mb-3">Past Trips</h2>
                  <div class="grid md:grid-cols-2 gap-4">
                    <For each={pastTrips()}>
                      {(trip) => (
                        <TripCard trip={trip} onDelete={() => handleDelete(trip.id)} />
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
          class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-md hover:bg-gray-50"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </a>
      </div>
    </div>
  );
}

function TripCard(props: { trip: Trip; onDelete: () => void }) {
  const statusColors = {
    upcoming: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    past: 'bg-gray-100 text-gray-800',
  };

  const status = () => props.trip.start_date ? getTripStatus(props.trip.start_date, props.trip.end_date || props.trip.start_date) : 'upcoming';

  return (
    <div class="bg-white rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900">{props.trip.name}</h3>
          {props.trip.destination && (
            <p class="text-sm text-gray-600 mt-1">📍 {props.trip.destination}</p>
          )}
        </div>
        <span class={`px-2 py-1 rounded text-xs font-medium ${statusColors[status()]}`}>
          {status()}
        </span>
      </div>

      {props.trip.start_date && (
        <p class="text-sm text-gray-600 mb-4">
          {formatDate(props.trip.start_date)}
          {props.trip.end_date && ` - ${formatDate(props.trip.end_date)}`}
        </p>
      )}

      <div class="flex gap-2">
        <a
          href={`/trips/${props.trip.id}/pack`}
          class="flex-1 text-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Pack
        </a>
        <button
          onClick={props.onDelete}
          class="px-3 py-2 text-gray-600 hover:text-red-600 text-sm"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
