/**
 * CSVImportExport Component
 *
 * Handles CSV import and export functionality for master items
 * Extracted from AllItemsPage for better separation of concerns
 */

import type { Accessor } from 'solid-js';
import type { Category, MasterItem } from '../../lib/types';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { masterItemsToCSV, csvToMasterItems, downloadCSV } from '../../lib/csv';
import { api, endpoints } from '../../lib/api';

interface CSVImportExportProps {
  items: Accessor<MasterItem[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onDataChanged: () => void;
}

export function CSVImportExport(props: CSVImportExportProps) {
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
            category = response.data as typeof existingCategories[number];
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
    <div class="flex gap-2">
      <Button variant="secondary" size="sm" onClick={handleExport}>
        Export
      </Button>
      <label class="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none">
        Import
        <input type="file" accept=".csv" onChange={handleImport} class="hidden" />
      </label>
    </div>
  );
}
