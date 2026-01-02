/**
 * DashboardPage Component
 *
 * Main dashboard - refactored for better maintainability
 * Delegates to focused sub-components for each concern
 */

import { createResource, createSignal, onMount, Show } from 'solid-js';
import { authStore } from '../stores/auth';
import { api, endpoints } from '../lib/api';
import type { Trip, MasterItem, Category } from '../lib/types';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Toast } from './ui/Toast';
import { fetchWithErrorHandling } from '../lib/resource-helpers';
import { DashboardStats } from './dashboard/DashboardStats';
import { OngoingTripsList } from './dashboard/OngoingTripsList';
import { UpcomingTripsList } from './dashboard/UpcomingTripsList';
import { AboutModal } from './dashboard/AboutModal';
import { UserMenu } from './dashboard/UserMenu';
import {
  OnboardingModal,
  hasSeenOnboarding,
  markOnboardingAsSeen,
} from './dashboard/OnboardingModal';

export function DashboardPage() {
  const [showAbout, setShowAbout] = createSignal(false);
  const [showOnboarding, setShowOnboarding] = createSignal(false);
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

    // Show onboarding for new users
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
    }
  });

  const handleCloseOnboarding = () => {
    markOnboardingAsSeen();
    setShowOnboarding(false);
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
              <div class="flex items-center gap-3">
                <button
                  onClick={() => setShowAbout(true)}
                  class="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  title="About PackZen"
                >
                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
                <UserMenu
                  categories={categories}
                  masterItems={masterItems}
                  onBackupRestored={handleBackupRestored}
                  onShowOnboarding={() => setShowOnboarding(true)}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Show
            when={!trips.loading && !masterItems.loading && !categories.loading}
            fallback={<LoadingSpinner />}
          >
            <Show
              when={!trips.error && !masterItems.error && !categories.error}
              fallback={
                <div class="flex flex-col items-center justify-center py-12">
                  <div class="rounded-lg bg-white p-8 text-center shadow-sm">
                    <div class="mb-4 text-6xl">⚠️</div>
                    <h2 class="mb-2 text-xl font-semibold text-gray-900">Unable to connect</h2>
                    <p class="mb-6 text-gray-600">
                      Cannot reach the server. Please check your connection and try again.
                    </p>
                    <button
                      onClick={() => {
                        refetchTrips();
                        refetchItems();
                        refetchCategories();
                      }}
                      class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              }
            >
              <div class="space-y-8">
                {/* Statistics */}
                <DashboardStats trips={trips} masterItems={masterItems} categories={categories} />

                {/* Ongoing Trips (only shows if there are any) */}
                <OngoingTripsList trips={trips} onTripUpdated={() => refetchTrips()} />

                {/* Upcoming Trips */}
                <UpcomingTripsList trips={trips} onTripUpdated={() => refetchTrips()} />

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
          </Show>
        </main>
      </div>

      <Show when={showAbout()}>
        <AboutModal onClose={() => setShowAbout(false)} />
      </Show>

      <Show when={showOnboarding()}>
        <OnboardingModal onClose={handleCloseOnboarding} />
      </Show>
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
