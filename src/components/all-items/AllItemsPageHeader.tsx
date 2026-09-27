/**
 * AllItemsPageHeader Component
 *
 * Title and actions for My Items: browse Suggestions, CSV export/import.
 */

import { createSignal, onMount, onCleanup, Show, type Accessor } from 'solid-js';
import type { Category, MasterItemWithCategory } from '../../lib/types';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { MoreVerticalIcon } from '../ui/Icons';
import { masterItemsToCSV, csvToMasterItems, downloadCSV } from '../../lib/csv';
import { resolveMasterItems } from '../../lib/item-helpers';

interface AllItemsPageHeaderProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onDataChanged: () => void;
  onBrowseTemplates: () => void;
}

export function AllItemsPageHeader(props: AllItemsPageHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [importProgress, setImportProgress] = createSignal<{ done: number; total: number } | null>(
    null
  );
  let menuRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showMenu()) setShowMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  const handleExport = () => {
    setShowMenu(false);
    const itemsList = props.items();
    if (!itemsList || itemsList.length === 0) {
      showToast('error', 'No items to export');
      return;
    }

    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`my-items-${timestamp}.csv`, masterItemsToCSV(itemsList));
    showToast('success', 'My Items exported');
  };

  const handleImport = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      input.value = ''; // so choosing the same file again still fires onChange
      const parsedItems = csvToMasterItems(text);
      const categoriesCache = [...(props.categories() || [])];
      const categoriesBefore = categoriesCache.length;
      setImportProgress({ done: 0, total: parsedItems.length });

      // The file is the source of truth for rows that already exist
      // (updateIfExists), unlike Suggestions, which leave saved items alone.
      const results = await resolveMasterItems(
        parsedItems.map((item) => ({
          name: item.name,
          description: item.description ?? null,
          category: item.category_name,
          quantity: item.default_quantity,
          is_container: item.is_container,
        })),
        [...(props.items() || [])],
        categoriesCache,
        {
          updateIfExists: true,
          onProgress: (done, total) => setImportProgress({ done, total }),
        }
      );

      const count = (status: string) => results.filter((r) => r.status === status).length;
      const failed = count('failed');
      const createdCategories = categoriesCache.length - categoriesBefore;
      let message = `Imported: ${count('created')} items created, ${count('updated')} updated`;
      if (createdCategories > 0) message += `, ${createdCategories} categories created`;
      if (failed > 0) message += `, ${failed} failed`;
      showToast(failed > 0 ? 'error' : 'success', message);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      setImportProgress(null);
      props.onDataChanged();
    }
  };

  return (
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div class="container mx-auto flex items-center gap-2 px-4 py-3 md:py-2">
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-bold text-gray-900 md:text-lg">My Items</h1>
          <Show
            when={importProgress()}
            fallback={
              <p class="truncate text-xs text-gray-600">
                My reusable packing essentials, for all trips
              </p>
            }
          >
            {(progress) => (
              <p class="text-xs text-blue-700" role="status">
                Importing… {progress().done}/{progress().total}
              </p>
            )}
          </Show>
        </div>

        <Button variant="secondary" size="sm" onClick={props.onBrowseTemplates}>
          Browse Suggestions
        </Button>

        <div class="relative" ref={menuRef}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowMenu(!showMenu())}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={showMenu()}
            disabled={!!importProgress()}
          >
            <MoreVerticalIcon class="h-5 w-5" />
          </Button>
          <Show when={showMenu()}>
            <div
              role="menu"
              class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <button
                role="menuitem"
                onClick={handleExport}
                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
              >
                Export to CSV
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setShowMenu(false);
                  fileInputRef?.click();
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
    </header>
  );
}
