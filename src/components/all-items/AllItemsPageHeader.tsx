/**
 * AllItemsPageHeader Component
 *
 * Header with navigation and action buttons for the All Items page
 * Extracted from AllItemsPage for better separation of concerns
 */

import type { Accessor } from 'solid-js';
import type { Category, MasterItemWithCategory } from '../../lib/types';
import { Button } from '../ui/Button';
import { CSVImportExport } from './CSVImportExport';

interface AllItemsPageHeaderProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onAddItem: () => void;
  onManageCategories: () => void;
  onManageBagTemplates: () => void;
  onDataChanged: () => void;
}

export function AllItemsPageHeader(props: AllItemsPageHeaderProps) {
  return (
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div class="container mx-auto px-4 py-4 md:py-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4 md:gap-2">
            <a
              href="/dashboard"
              class="flex items-center text-gray-600 hover:text-gray-900"
              title="Home"
            >
              <svg
                class="h-6 w-6 md:h-5 md:w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </a>
            <div>
              <h1 class="text-2xl md:text-lg font-bold text-gray-900">All Items</h1>
              <p class="text-sm md:text-xs text-gray-600">Your reusable packing essentials</p>
            </div>
          </div>
          <div class="flex gap-2">
            <Button variant="secondary" size="sm" onClick={props.onManageCategories}>
              Categories
            </Button>
            <Button variant="secondary" size="sm" onClick={props.onManageBagTemplates}>
              My Bags
            </Button>
            <CSVImportExport
              items={props.items}
              categories={props.categories}
              onDataChanged={props.onDataChanged}
            />
            <Button size="sm" onClick={props.onAddItem}>
              + Add Item
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
