/**
 * DashboardStats Component
 *
 * Displays statistics cards for trips, items, and categories
 * Extracted from DashboardPage for better separation of concerns
 */

import type { Accessor } from 'solid-js';
import type { Trip, MasterItem, Category } from '../../lib/types';

interface DashboardStatsProps {
  trips: Accessor<Trip[] | undefined>;
  masterItems: Accessor<MasterItem[] | undefined>;
  categories: Accessor<Category[] | undefined>;
}

export function DashboardStats(props: DashboardStatsProps) {
  return (
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <StatCard
        title="Total Trips"
        value={props.trips()?.length || 0}
        icon="✈️"
        linkTo="/trips"
        linkText="View all trips"
      />
      <StatCard
        title="All Items"
        value={props.masterItems()?.length || 0}
        icon="📦"
        linkTo="/all-items"
        linkText="Manage items"
      />
      <StatCard
        title="Categories"
        value={props.categories()?.length || 0}
        icon="🏷️"
        linkTo="/all-items"
        linkText="Manage categories"
      />
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: string;
  linkTo: string;
  linkText: string;
}

function StatCard(props: StatCardProps) {
  return (
    <div class="rounded-lg bg-white p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600">{props.title}</p>
          <p class="mt-2 text-3xl font-semibold text-gray-900">{props.value}</p>
        </div>
        <div class="text-4xl">{props.icon}</div>
      </div>
      <div class="mt-4">
        <a
          href={props.linkTo}
          class="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          {props.linkText} →
        </a>
      </div>
    </div>
  );
}
