import { createSignal, createResource, For, Show, onCleanup, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripWithStats } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { EditIcon, CopyIcon, TrashIcon, MoreVerticalIcon } from '../ui/Icons';
import { TripForm } from './TripForm';
import { TripFormWithBags } from './TripFormWithBags';
import { NewTripImportModal } from './NewTripImportModal';
import { TripTypeGrid } from './StarterListPanel';
import { OnboardingModal } from '../nav/OnboardingModal';
import { builtInItems } from '../../lib/built-in-items';
import { formatDateRange, getTripStatus } from '../../lib/utils';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';
import { deleteTripWithConfirm } from '../../lib/trip-actions';

export function TripsPage() {
  const [showForm, setShowForm] = createSignal(false);
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);
  const [showImport, setShowImport] = createSignal(false);
  const [showMenu, setShowMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  const [trips, { refetch }] = createResource<TripWithStats[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<TripWithStats[]>(endpoints.trips),
      'Failed to load trips'
    );
  });

  onMount(async () => {
    const closeMenuOnOutsideClick = (e: MouseEvent) => {
      if (showMenu() && menuRef && !e.composedPath().includes(menuRef)) setShowMenu(false);
    };
    document.addEventListener('mousedown', closeMenuOnOutsideClick);
    onCleanup(() => document.removeEventListener('mousedown', closeMenuOnOutsideClick));

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
  };

  const handleCopy = async (trip: Trip) => {
    const response = await api.post(`/api/trips/${trip.id}/copy`, {});
    if (!response.success) {
      showToast('error', response.error || 'Failed to copy trip');
      return;
    }
    showToast('success', `Created copy of "${trip.name}"`);
    refetch();
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
            <div>
              <h1 class="text-2xl font-bold text-gray-900">My Trips</h1>
              <p class="text-sm text-gray-600">Plan and pack for your adventures</p>
            </div>
            <div class="flex items-center gap-2">
              <Button size="sm" class="whitespace-nowrap" onClick={() => setShowForm(true)}>
                + New Trip
              </Button>
              <div class="relative" ref={menuRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMenu(!showMenu())}
                  aria-label="More actions"
                  aria-expanded={showMenu()}
                >
                  <MoreVerticalIcon class="h-5 w-5" />
                </Button>
                <Show when={showMenu()}>
                  <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowImport(true);
                      }}
                      class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      Import trip from file…
                    </button>
                  </div>
                </Show>
              </div>
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
              fallback={<FirstTripHero onCustomTrip={() => setShowForm(true)} />}
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

      <Show when={editingTrip()}>
        {(trip) => (
          <TripForm
            trip={trip()}
            onClose={() => setEditingTrip(null)}
            onSaved={() => {
              setEditingTrip(null);
              refetch();
            }}
          />
        )}
      </Show>

      <Show when={showForm()}>
        <TripFormWithBags
          onClose={() => setShowForm(false)}
          onSaved={(tripId) => {
            // Navigate to the newly created trip's packing page
            window.location.href = `/trips/${tripId}/pack`;
          }}
        />
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

/**
 * A new user's home: one tap on a trip type creates the trip (named after the
 * type, with a carry-on) and opens it with that starter list applied.
 */
function FirstTripHero(props: { onCustomTrip: () => void }) {
  const [busy, setBusy] = createSignal<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = createSignal(false);

  const startTrip = async (tripTypeId: string) => {
    const tripType = builtInItems.trip_types.find((t) => t.id === tripTypeId);
    if (!tripType || busy()) return;
    setBusy(tripTypeId);
    const response = await api.post<Trip>(endpoints.trips, { name: tripType.trip_name });
    if (!response.success || !response.data) {
      showToast('error', response.error || 'Failed to create trip');
      setBusy(null);
      return;
    }
    const tripId = response.data.id;
    // Without the bag the list still works (items go in no bag), so carry on regardless.
    await api.post(endpoints.tripBags(tripId), {
      name: 'Carry-on',
      type: 'carry_on',
      color: 'blue',
      sort_order: 0,
    });
    window.location.href = `/trips/${tripId}/pack?starter=${tripTypeId}`;
  };

  return (
    <div class="mx-auto max-w-xl py-4 text-center md:py-10">
      <h2 class="mb-1 text-2xl font-bold text-gray-900">What kind of trip?</h2>
      <p class="mb-5 text-gray-600">
        Tap one to start a packing list. You can rename it and add dates and bags any time.
      </p>
      <TripTypeGrid onPick={startTrip} busy={busy()} />
      <Show when={busy()}>
        <p class="mt-4 text-sm text-gray-500" role="status">
          Setting up your trip…
        </p>
      </Show>
      <div class="mt-6 flex flex-wrap items-center justify-center gap-x-4 text-sm">
        <button
          type="button"
          onClick={props.onCustomTrip}
          class="text-blue-700 underline-offset-2 hover:underline"
        >
          Set up a trip yourself
        </button>
        <button
          type="button"
          onClick={() => setShowHowItWorks(true)}
          class="text-gray-600 underline-offset-2 hover:underline"
        >
          How PackZen works
        </button>
      </div>
      <Show when={showHowItWorks()}>
        <OnboardingModal onClose={() => setShowHowItWorks(false)} />
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
