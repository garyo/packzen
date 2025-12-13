import { createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../stores/auth';
import { api, endpoints } from '../lib/api';
import type { Trip, MasterItem, Category } from '../lib/types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { formatDate, getTripStatus } from '../lib/utils';
import { fetchWithErrorHandling } from '../lib/resource-helpers';

export function DashboardPage() {
  const [masterItems] = createResource<MasterItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItem[]>(endpoints.masterItems),
      'Failed to load items'
    );
  });

  const [trips] = createResource<Trip[]>(async () => {
    return fetchWithErrorHandling(() => api.get<Trip[]>(endpoints.trips), 'Failed to load trips');
  });

  const [categories] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  onMount(async () => {
    await authStore.initAuth();
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

  return (
    <div class="min-h-screen bg-gray-50">
      {/* Header */}
      <header class="border-b border-gray-200 bg-white">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-gray-900">PackZen</h1>
            <button
              onClick={handleSignOut}
              class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign Out
            </button>
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
