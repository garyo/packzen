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
import { HelpIcon } from './ui/Icons';
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

  // Brand-new users (zero trips) get trip creation as the dashboard hero instead
  // of scrolling past zero-value stat cards to find it.
  const hasNoTrips = () => (trips() ?? []).length === 0;

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
                  <HelpIcon class="h-6 w-6" />
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
                {/* Zero-trip hero: trip creation is the first thing a new user sees */}
                <Show when={hasNoTrips()}>
                  <div class="text-center">
                    <h2 class="text-2xl font-bold text-gray-900">Plan your first trip</h2>
                    <p class="mt-2 text-gray-600">
                      Add bags and items, then start packing — right from here.
                    </p>
                  </div>
                  <PlanTripQuickLink />
                </Show>

                {/* Statistics: hidden for brand-new users so the CTA above isn't
                    buried under two zero-value cards */}
                <Show when={!hasNoTrips()}>
                  <DashboardStats trips={trips} masterItems={masterItems} categories={categories} />
                </Show>

                {/* Ongoing Trips (only shows if there are any) */}
                <OngoingTripsList trips={trips} onTripUpdated={() => refetchTrips()} />

                {/* Upcoming Trips */}
                <UpcomingTripsList trips={trips} onTripUpdated={() => refetchTrips()} />

                {/* Quick Links: only needed once trips exist; the zero-trip state
                    already shows this CTA as the hero above */}
                <Show when={!hasNoTrips()}>
                  <PlanTripQuickLink />
                </Show>
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

function PlanTripQuickLink() {
  return (
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
