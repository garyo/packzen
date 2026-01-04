import { createSignal, createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripWithStats } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { HomeIcon, EditIcon, CopyIcon, TrashIcon } from '../ui/Icons';
import { TripForm } from './TripForm';
import { TripFormWithBags } from './TripFormWithBags';
import { NewTripImportModal } from './NewTripImportModal';
import { formatDateRange, getTripStatus } from '../../lib/utils';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';
import { deleteTripWithConfirm } from '../../lib/trip-actions';

export function TripsPage() {
  const [showForm, setShowForm] = createSignal(false);
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);
  const [showImport, setShowImport] = createSignal(false);

  const [trips, { refetch }] = createResource<TripWithStats[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<TripWithStats[]>(endpoints.trips),
      'Failed to load trips'
    );
  });

  onMount(async () => {
    await authStore.initAuth();

    // Auto-open New Trip modal if ?new=true in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('new') === 'true') {
      setShowForm(true);
      // Clear the URL parameter
      window.history.replaceState({}, '', '/trips');
    }
  });

  const handleEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setShowForm(true);
  };

  const handleCopy = async (trip: Trip) => {
    try {
      const response = await api.post(`/api/trips/${trip.id}/copy`, {});

      if (!response.success) {
        showToast('error', response.error || 'Failed to copy trip');
        return;
      }

      showToast('success', `Created copy of "${trip.name}"`);
      refetch();
    } catch (error) {
      showToast('error', 'Failed to copy trip');
    }
  };

  const handleDelete = async (trip: Trip) => {
    await deleteTripWithConfirm(trip.id, trip.name, () => refetch());
  };

  const upcomingTrips = () =>
    trips()
      ?.filter(
        (t) =>
          !t.start_date || getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
      )
      .sort((a, b) => {
        // Trips without dates go to the end
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        // Sort by date ascending (soonest first)
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      }) || [];
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
                class="flex items-center text-gray-600 hover:text-gray-900"
                title="Home"
              >
                <HomeIcon class="h-6 w-6" />
              </a>
              <div>
                <h1 class="text-2xl font-bold text-gray-900">My Trips</h1>
                <p class="text-sm text-gray-600">Plan and pack for your adventures</p>
              </div>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                Import
              </Button>
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
            when={!trips.error}
            fallback={
              <EmptyState
                icon="⚠️"
                title="Unable to connect"
                description="Cannot reach the server. Please check your connection and try again."
                action={<Button onClick={() => refetch()}>Retry</Button>}
              />
            }
          >
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
                            onEdit={() => handleEdit(trip)}
                            onCopy={() => handleCopy(trip)}
                            onDelete={() => handleDelete(trip)}
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
                            onEdit={() => handleEdit(trip)}
                            onCopy={() => handleCopy(trip)}
                            onDelete={() => handleDelete(trip)}
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
                            onEdit={() => handleEdit(trip)}
                            onCopy={() => handleCopy(trip)}
                            onDelete={() => handleDelete(trip)}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </main>

      <Show when={showForm()}>
        {editingTrip() ? (
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
        ) : (
          <TripFormWithBags
            onClose={() => setShowForm(false)}
            onSaved={(tripId) => {
              // Navigate to the newly created trip's packing page
              window.location.href = `/trips/${tripId}/pack`;
            }}
          />
        )}
      </Show>

      <Show when={showImport()}>
        <NewTripImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            refetch();
          }}
        />
      </Show>
    </div>
  );
}

function TripCard(props: {
  trip: TripWithStats;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
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
          <p class="mt-1 min-h-[1.25rem] text-sm text-gray-600">
            {props.trip.destination && <>📍 {props.trip.destination}</>}
          </p>
        </div>
        <span class={`rounded px-2 py-1 text-xs font-medium ${statusColors[status()]}`}>
          {status()}
        </span>
      </div>

      <p class="mb-2 text-sm text-gray-600">
        {formatDateRange(props.trip.start_date, props.trip.end_date) || (
          <span class="text-gray-400">No date set</span>
        )}
      </p>

      {/* Statistics */}
      <div class="mb-4 flex gap-4 text-sm text-gray-600">
        <div class="flex items-center gap-1">
          <span>🧳</span>
          <span>
            {props.trip.bag_count} {props.trip.bag_count === 1 ? 'bag' : 'bags'}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <span>✓</span>
          <span>
            {props.trip.items_packed}/{props.trip.items_total} items
          </span>
        </div>
      </div>

      <div class="flex gap-2">
        <a
          href={`/trips/${props.trip.id}/pack`}
          class="flex-1 rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Pack
        </a>
        <button
          onClick={props.onEdit}
          class="p-2 text-gray-400 hover:text-blue-600"
          title="Edit this trip"
        >
          <EditIcon class="h-5 w-5" />
        </button>
        <button
          onClick={props.onCopy}
          class="p-2 text-gray-400 hover:text-blue-600"
          title="Copy this trip"
        >
          <CopyIcon class="h-5 w-5" />
        </button>
        <button
          onClick={props.onDelete}
          class="p-2 text-gray-400 hover:text-red-600"
          title="Delete this trip"
        >
          <TrashIcon class="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
