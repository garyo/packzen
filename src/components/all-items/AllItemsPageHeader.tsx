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
              class="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <svg
                class="h-5 w-5 md:h-4 md:w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
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
