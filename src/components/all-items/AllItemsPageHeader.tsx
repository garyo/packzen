/**
 * AllItemsPageHeader Component
 *
 * Header with navigation and action buttons for the All Items page
 * Extracted from AllItemsPage for better separation of concerns
 */

import { createSignal, onMount, onCleanup, type Accessor } from 'solid-js';
import { Show } from 'solid-js';
import type { Category, MasterItemWithCategory } from '../../lib/types';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { masterItemsToCSV, csvToMasterItems, downloadCSV } from '../../lib/csv';
import { api, endpoints } from '../../lib/api';

interface AllItemsPageHeaderProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onDataChanged: () => void;
}

export function AllItemsPageHeader(props: AllItemsPageHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMenu()) setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  const handleExport = () => {
    const itemsList = props.items();
    if (!itemsList || itemsList.length === 0) {
      showToast('error', 'No items to export');
      return;
    }

    const csv = masterItemsToCSV(itemsList);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`all-items-${timestamp}.csv`, csv);
    showToast('success', 'All items exported');
    setShowMenu(false);
  };

  const handleImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedItems = csvToMasterItems(text);
      const existingItems = props.items() || [];
      const existingCategories = props.categories() || [];

      let createdCount = 0;
      let updatedCount = 0;
      let createdCategoriesCount = 0;

      // Helper to get or create category by name
      const getCategoryId = async (categoryName: string | undefined): Promise<string | null> => {
        if (!categoryName) return null;

        // Check if category exists (case-insensitive)
        let category = existingCategories.find(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase()
        );

        // Create category if it doesn't exist
        if (!category) {
          const response = await api.post(endpoints.categories, { name: categoryName });
          if (response.success && response.data) {
            category = response.data as (typeof existingCategories)[number];
            existingCategories.push(category);
            createdCategoriesCount++;
          }
        }

        return category?.id || null;
      };

      for (const item of parsedItems) {
        // Get or create category
        const category_id = await getCategoryId(item.category_name);

        // Check if item with same name exists (case-insensitive)
        const existing = existingItems.find(
          (e) => e.name.toLowerCase() === item.name.toLowerCase()
        );

        if (existing) {
          // Update existing item
          const response = await api.put(endpoints.masterItem(existing.id), {
            name: existing.name,
            description: item.description || existing.description,
            category_id: category_id || existing.category_id,
            default_quantity: item.default_quantity,
          });
          if (response.success) {
            updatedCount++;
          }
        } else {
          // Create new item
          const response = await api.post(endpoints.masterItems, {
            name: item.name,
            description: item.description,
            category_id,
            default_quantity: item.default_quantity,
          });
          if (response.success) {
            createdCount++;
          }
        }
      }

      let message = `Imported: ${createdCount} items created, ${updatedCount} updated`;
      if (createdCategoriesCount > 0) {
        message += `, ${createdCategoriesCount} categories created`;
      }
      showToast('success', message);

      props.onDataChanged();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      input.value = ''; // Reset file input
    }
  };
  return (
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div class="container mx-auto px-4 py-4 md:py-2">
        {/* Two-row layout on mobile, single row on desktop */}
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {/* Title row */}
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <a
              href="/dashboard"
              class="flex flex-shrink-0 items-center text-gray-600 hover:text-gray-900"
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
            <div class="min-w-0 flex-1">
              <h1 class="truncate text-xl font-bold text-gray-900 md:text-lg">All Items</h1>
              <p class="text-xs text-gray-600">Your reusable packing essentials</p>
            </div>
          </div>

          {/* Buttons row */}
          <div class="flex flex-shrink-0 gap-2">
            {/* More menu (Import/Export) */}
            <div class="relative" ref={menuRef}>
              <Button variant="secondary" size="sm" onClick={() => setShowMenu(!showMenu())}>
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </Button>
              <Show when={showMenu()}>
                <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                  <button
                    onClick={handleExport}
                    class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                  >
                    Export to CSV
                  </button>
                  <button
                    onClick={() => {
                      fileInputRef?.click();
                      setShowMenu(false);
                    }}
                    class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                  >
                    Import from CSV
                  </button>
                </div>
              </Show>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImport}
                class="hidden"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
