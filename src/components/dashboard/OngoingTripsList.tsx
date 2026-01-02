/**
 * OngoingTripsList Component
 *
 * Displays trips that are currently in progress (started but not ended)
 */

import { For, Show, createSignal, type Accessor } from 'solid-js';
import type { Trip } from '../../lib/types';
import { formatDateRange, getTripStatus } from '../../lib/utils';
import { TripForm } from '../trips/TripForm';

interface OngoingTripsListProps {
  trips: Accessor<Trip[] | undefined>;
  onTripUpdated?: () => void;
}

export function OngoingTripsList(props: OngoingTripsListProps) {
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);

  const ongoingTrips = () => {
    const allTrips = props.trips() || [];
    return allTrips
      .filter(
        (t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'active'
      )
      .sort((a, b) => {
        // Sort by end date (soonest ending first)
        if (!a.end_date && !b.end_date) return 0;
        if (!a.end_date) return 1;
        if (!b.end_date) return -1;
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      });
  };

  // Only render if there are ongoing trips
  return (
    <Show when={ongoingTrips().length > 0}>
      <div class="rounded-lg bg-white p-6 shadow-sm">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">Ongoing Trips</h2>
        </div>

        <div class="space-y-4">
          <For each={ongoingTrips()}>
            {(trip) => <OngoingTripCard trip={trip} onEdit={() => setEditingTrip(trip)} />}
          </For>
        </div>

        {/* Trip Edit Modal */}
        <Show when={editingTrip()}>
          <TripForm
            trip={editingTrip()}
            onClose={() => setEditingTrip(null)}
            onSaved={() => {
              setEditingTrip(null);
              props.onTripUpdated?.();
            }}
          />
        </Show>
      </div>
    </Show>
  );
}

interface OngoingTripCardProps {
  trip: Trip;
  onEdit: () => void;
}

function OngoingTripCard(props: OngoingTripCardProps) {
  return (
    <a
      href={`/trips/${props.trip.id}/pack`}
      class="block rounded-lg border border-green-200 bg-green-50 p-4 transition-colors hover:border-green-400 hover:bg-green-100"
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h3 class="font-medium text-gray-900">{props.trip.name}</h3>
          <Show when={props.trip.destination}>
            <p class="mt-1 text-sm text-gray-600">{props.trip.destination}</p>
          </Show>
          <p class="mt-1 text-sm text-gray-500">
            {formatDateRange(props.trip.start_date, props.trip.end_date)}
          </p>
        </div>
        <div class="ml-4 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              props.onEdit();
            }}
            class="rounded p-1 text-gray-600 hover:bg-green-200 hover:text-gray-900"
            title="Edit trip"
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
          <span class="inline-flex items-center rounded-full bg-green-600 px-2.5 py-0.5 text-xs font-medium text-white">
            In Progress
          </span>
        </div>
      </div>
    </a>
  );
}
