/**
 * UpcomingTripsList Component
 *
 * Displays upcoming trips with their status
 * Extracted from DashboardPage for better separation of concerns
 */

import { For, Show, createSignal, type Accessor } from 'solid-js';
import type { Trip } from '../../lib/types';
import { formatDateRange, getTripStatus } from '../../lib/utils';
import { TripForm } from '../trips/TripForm';
import { EditIcon } from '../ui/Icons';

interface UpcomingTripsListProps {
  trips: Accessor<Trip[] | undefined>;
  onTripUpdated?: () => void;
}

export function UpcomingTripsList(props: UpcomingTripsListProps) {
  const [editingTrip, setEditingTrip] = createSignal<Trip | null>(null);
  const upcomingTrips = () => {
    const allTrips = props.trips() || [];
    return allTrips
      .filter(
        (t) =>
          !t.start_date || getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
      )
      .sort((a, b) => {
        // Trips without dates go to the end
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      })
      .slice(0, 2);
  };

  const upcomingCount = () => {
    const allTrips = props.trips() || [];
    return allTrips.filter(
      (t) => !t.start_date || getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming'
    ).length;
  };

  return (
    <div class="rounded-lg bg-white p-6 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Upcoming Trips</h2>
        <Show when={upcomingCount() > 2}>
          <a href="/trips" class="text-sm text-blue-600 hover:text-blue-500">
            View all ({upcomingCount()})
          </a>
        </Show>
      </div>

      <Show
        when={upcomingTrips().length > 0}
        fallback={
          <div class="py-8 text-center">
            <p class="text-gray-500">No upcoming trips</p>
            <a
              href="/trips"
              class="mt-2 inline-block text-lg font-medium text-blue-600 hover:text-blue-500"
            >
              Plan a trip →
            </a>
          </div>
        }
      >
        <div class="space-y-4">
          <For each={upcomingTrips()}>
            {(trip) => <TripCard trip={trip} onEdit={() => setEditingTrip(trip)} />}
          </For>
        </div>
      </Show>

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
  );
}

interface TripCardProps {
  trip: Trip;
  onEdit: () => void;
}

function TripCard(props: TripCardProps) {
  return (
    <a
      href={`/trips/${props.trip.id}/pack`}
      class="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h3 class="font-medium text-gray-900">{props.trip.name}</h3>
          <Show when={props.trip.destination}>
            <p class="mt-1 text-sm text-gray-600">📍 {props.trip.destination}</p>
          </Show>
          <p class="mt-1 text-sm text-gray-500">
            {formatDateRange(props.trip.start_date, props.trip.end_date) || (
              <span class="text-gray-400">No date set</span>
            )}
          </p>
        </div>
        <div class="ml-4 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              props.onEdit();
            }}
            class="rounded p-1 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            title="Edit trip"
          >
            <EditIcon class="h-5 w-5" />
          </button>
          <span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            Upcoming
          </span>
        </div>
      </div>
    </a>
  );
}
