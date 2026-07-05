/**
 * CSVImportExport Component
 *
 * Handles CSV import and export functionality for master items
 * Extracted from AllItemsPage for better separation of concerns
 */

import { createSignal, Show, type Accessor } from 'solid-js';
import type { Category, MasterItemWithCategory } from '../../lib/types';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { masterItemsToCSV, csvToMasterItems, downloadCSV } from '../../lib/csv';
import { resolveMasterItems } from '../../lib/item-helpers';

interface CSVImportExportProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onDataChanged: () => void;
}

export function CSVImportExport(props: CSVImportExportProps) {
  const [importProgress, setImportProgress] = createSignal<{ done: number; total: number } | null>(
    null
  );

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
      const masterItemsCache = [...(props.items() || [])];
      const categoriesCache = [...(props.categories() || [])];
      const categoriesBefore = categoriesCache.length;

      setImportProgress({ done: 0, total: parsedItems.length });

      // Rows resolve concurrently instead of one request at a time; CSV import
      // treats the file as the source of truth for rows that already exist
      // (updateIfExists), unlike the quick-add flows which leave a matched
      // master item's saved metadata alone.
      const results = await resolveMasterItems(
        parsedItems.map((item) => ({
          name: item.name,
          description: item.description ?? null,
          category: item.category_name,
          quantity: item.default_quantity,
          is_container: item.is_container,
        })),
        masterItemsCache,
        categoriesCache,
        {
          updateIfExists: true,
          onProgress: (done, total) => setImportProgress({ done, total }),
        }
      );

      const createdCount = results.filter((r) => r.status === 'created').length;
      const updatedCount = results.filter((r) => r.status === 'updated').length;
      const failedCount = results.filter((r) => r.status === 'failed').length;
      const createdCategoriesCount = categoriesCache.length - categoriesBefore;

      let message = `Imported: ${createdCount} items created, ${updatedCount} updated`;
      if (createdCategoriesCount > 0) {
        message += `, ${createdCategoriesCount} categories created`;
      }
      if (failedCount > 0) {
        message += `, ${failedCount} failed`;
      }
      showToast(failedCount > 0 ? 'error' : 'success', message);

      props.onDataChanged();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      setImportProgress(null);
      input.value = ''; // Reset file input
    }
  };

  return (
    <div class="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleExport} disabled={!!importProgress()}>
        Export
      </Button>
      <label
        class="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        aria-disabled={!!importProgress()}
      >
        Import
        <input
          type="file"
          accept=".csv"
          onChange={handleImport}
          disabled={!!importProgress()}
          class="hidden"
        />
      </label>
      <Show when={importProgress()}>
        {(progress) => (
          <span class="text-sm text-gray-500">
            Importing… {progress().done}/{progress().total}
          </span>
        )}
      </Show>
    </div>
  );
}
