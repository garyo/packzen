import { createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../stores/auth';
import { api, endpoints } from '../lib/api';
import type { Trip, MasterItem, Category } from '../lib/types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { formatDate, getTripStatus } from '../lib/utils';

export function DashboardPage() {
  const [masterItems] = createResource<MasterItem[]>(async () => {
    const response = await api.get<MasterItem[]>(endpoints.masterItems);
    return response.success && response.data ? response.data : [];
  });

  const [trips] = createResource<Trip[]>(async () => {
    const response = await api.get<Trip[]>(endpoints.trips);
    return response.success && response.data ? response.data : [];
  });

  const [categories] = createResource<Category[]>(async () => {
    const response = await api.get<Category[]>(endpoints.categories);
    return response.success && response.data ? response.data : [];
  });

  onMount(async () => {
    await authStore.initAuth();
  });

  const upcomingTrips = () => {
    const allTrips = trips() || [];
    return allTrips
      .filter((t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'upcoming')
      .sort((a, b) => {
        if (!a.start_date || !b.start_date) return 0;
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      })
      .slice(0, 2);
  };

  const activeTripsCount = () => {
    const allTrips = trips() || [];
    return allTrips.filter(
      (t) => t.start_date && getTripStatus(t.start_date, t.end_date || t.start_date) === 'active'
    ).length;
  };

  const handleSignOut = async () => {
    await authStore.signOut();
  };

  return (
    <div class="min-h-screen bg-gray-50">
      {/* Header */}
      <header class="bg-white border-b border-gray-200">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-gray-900">Packing List</h1>
            <button
              onClick={handleSignOut}
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
            <h2 class="text-3xl font-bold text-gray-900 mb-2">Welcome back!</h2>
            <p class="text-gray-600">Manage your packing lists and trips</p>
          </div>

          {/* Upcoming Trips */}
          <Show when={upcomingTrips().length > 0}>
            <div class="mb-8">
              <h3 class="text-xl font-semibold text-gray-900 mb-4">Upcoming Trips</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <For each={upcomingTrips()}>
                  {(trip) => (
                    <div class="bg-white rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow">
                      <div class="flex items-start justify-between mb-3">
                        <div class="flex-1">
                          <h4 class="text-lg font-semibold text-gray-900">{trip.name}</h4>
                          {trip.destination && (
                            <p class="text-sm text-gray-600 mt-1">📍 {trip.destination}</p>
                          )}
                        </div>
                        <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          upcoming
                        </span>
                      </div>
                      {trip.start_date && (
                        <p class="text-sm text-gray-600 mb-4">
                          {formatDate(trip.start_date)}
                          {trip.end_date && ` - ${formatDate(trip.end_date)}`}
                        </p>
                      )}
                      <a
                        href={`/trips/${trip.id}/pack`}
                        class="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                      >
                        Start Packing →
                      </a>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="grid md:grid-cols-2 gap-6">
            {/* Master List Card */}
            <div class="bg-white rounded-lg shadow-md p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-semibold text-gray-900">Master List</h3>
                <span class="text-3xl">📝</span>
              </div>
              <p class="text-gray-600 mb-4">
                Your reusable packing list with all your essentials organized by category.
              </p>
              <a
                href="/master-list"
                class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Manage Items →
              </a>
            </div>

            {/* Trips Card */}
            <div class="bg-white rounded-lg shadow-md p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-semibold text-gray-900">My Trips</h3>
                <span class="text-3xl">🧳</span>
              </div>
              <p class="text-gray-600 mb-4">
                Create and manage trip-specific packing lists with bag organization.
              </p>
              <a
                href="/trips"
                class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                View Trips →
              </a>
            </div>
          </div>

          {/* Quick Stats */}
          <div class="mt-8 bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div>
                <div class="text-3xl font-bold text-blue-600">{masterItems()?.length || 0}</div>
                <div class="text-sm text-gray-600">Master Items</div>
              </div>
              <div>
                <div class="text-3xl font-bold text-green-600">{activeTripsCount()}</div>
                <div class="text-sm text-gray-600">Active Trips</div>
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
