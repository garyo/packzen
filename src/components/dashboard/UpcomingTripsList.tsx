/**
 * UpcomingTripsList Component
 *
 * Displays upcoming trips with their status
 * Extracted from DashboardPage for better separation of concerns
 */

import { For, Show, type Accessor } from 'solid-js';
import type { Trip } from '../../lib/types';
import { formatDate, getTripStatus } from '../../lib/utils';

interface UpcomingTripsListProps {
  trips: Accessor<Trip[] | undefined>;
}

export function UpcomingTripsList(props: UpcomingTripsListProps) {
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
              class="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Plan a trip →
            </a>
          </div>
        }
      >
        <div class="space-y-4">
          <For each={upcomingTrips()}>
            {(trip) => <TripCard trip={trip} />}
          </For>
        </div>
      </Show>
    </div>
  );
}

interface TripCardProps {
  trip: Trip;
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
            <Show when={props.trip.start_date} fallback={<span class="text-gray-400">No date set</span>}>
              {formatDate(props.trip.start_date!)}
              <Show when={props.trip.end_date && props.trip.end_date !== props.trip.start_date}>
                {' '}
                - {formatDate(props.trip.end_date!)}
              </Show>
            </Show>
          </p>
        </div>
        <div class="ml-4">
          <span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            Upcoming
          </span>
        </div>
      </div>
    </a>
  );
}
