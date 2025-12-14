/**
 * DashboardPage Component
 *
 * Main dashboard - refactored for better maintainability
 * Delegates to focused sub-components for each concern
 */

import { createResource, onMount, Show } from 'solid-js';
import { authStore } from '../stores/auth';
import { api, endpoints } from '../lib/api';
import type { Trip, MasterItem, Category } from '../lib/types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Toast } from './ui/Toast';
import { fetchWithErrorHandling } from '../lib/resource-helpers';
import { BackupManager } from './dashboard/BackupManager';
import { DashboardStats } from './dashboard/DashboardStats';
import { UpcomingTripsList } from './dashboard/UpcomingTripsList';

export function DashboardPage() {
  // Data fetching
  const [masterItems, { refetch: refetchItems }] = createResource<MasterItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItem[]>(endpoints.masterItems),
      'Failed to load items'
    );
  });

  const [trips, { refetch: refetchTrips }] = createResource<Trip[]>(async () => {
    return fetchWithErrorHandling(() => api.get<Trip[]>(endpoints.trips), 'Failed to load trips');
  });

  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  onMount(async () => {
    await authStore.initAuth();
  });

  const handleSignOut = async () => {
    await authStore.signOut();
  };

  const handleBackupRestored = () => {
    refetchCategories();
    refetchItems();
    refetchTrips();
  };

  return (
    <>
      <Toast />
      <div class="min-h-screen bg-gray-50">
        {/* Header */}
        <header class="border-b border-gray-200 bg-white">
          <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div class="flex h-16 items-center justify-between">
              <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
              <div class="flex items-center gap-2">
                <BackupManager
                  categories={categories}
                  masterItems={masterItems}
                  onBackupRestored={handleBackupRestored}
                />
                <button
                  onClick={handleSignOut}
                  class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Show when={!trips.loading && !masterItems.loading && !categories.loading} fallback={<LoadingSpinner />}>
            <div class="space-y-8">
              {/* Statistics */}
              <DashboardStats
                trips={trips}
                masterItems={masterItems}
                categories={categories}
              />

              {/* Upcoming Trips */}
              <UpcomingTripsList trips={trips} />

              {/* Quick Links */}
              <div class="flex justify-center">
                <div class="w-full max-w-md">
                  <QuickLink
                    href="/trips?new=true"
                    icon="➕"
                    title="Plan New Trip"
                    description="Start planning your next adventure"
                  />
                </div>
              </div>
            </div>
          </Show>
        </main>
      </div>
    </>
  );
}

interface QuickLinkProps {
  href: string;
  icon: string;
  title: string;
  description: string;
}

function QuickLink(props: QuickLinkProps) {
  return (
    <a
      href={props.href}
      class="block rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-blue-300 hover:bg-blue-50"
    >
      <div class="flex items-start">
        <div class="text-3xl">{props.icon}</div>
        <div class="ml-4">
          <h3 class="font-medium text-gray-900">{props.title}</h3>
          <p class="mt-1 text-sm text-gray-600">{props.description}</p>
        </div>
      </div>
    </a>
  );
}
