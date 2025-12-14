import { createSignal, createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { TripForm } from './TripForm';
import { TripFormWithBags } from './TripFormWithBags';
import { NewTripImportModal } from './NewTripImportModal';
import { formatDate, getTripStatus } from '../../lib/utils';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';
import { deleteTripWithConfirm } from '../../lib/trip-actions';

export function TripsPage() {
  const [showForm, setShowForm] = createSignal(false);
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);
  const [showImport, setShowImport] = createSignal(false);

  const [trips, { refetch }] = createResource<Trip[]>(async () => {
    return fetchWithErrorHandling(() => api.get<Trip[]>(endpoints.trips), 'Failed to load trips');
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
    trips()?.filter(
      (t) => !t.start_date || getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
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
                class="flex items-center text-gray-600 hover:text-gray-900"
                title="Home"
              >
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
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

function TripCard(props: { trip: Trip; onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
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
          <p class="mt-1 text-sm text-gray-600 min-h-[1.25rem]">
            {props.trip.destination && <>📍 {props.trip.destination}</>}
          </p>
        </div>
        <span class={`rounded px-2 py-1 text-xs font-medium ${statusColors[status()]}`}>
          {status()}
        </span>
      </div>

      <p class="mb-4 text-sm text-gray-600">
        {props.trip.start_date ? (
          <>
            {formatDate(props.trip.start_date)}
            {props.trip.end_date && ` - ${formatDate(props.trip.end_date)}`}
          </>
        ) : (
          <span class="text-gray-400">No date set</span>
        )}
      </p>

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
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={props.onCopy}
          class="p-2 text-gray-400 hover:text-blue-600"
          title="Copy this trip"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
        <button
          onClick={props.onDelete}
          class="p-2 text-gray-400 hover:text-red-600"
          title="Delete this trip"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  );
}
