import { createSignal, createResource, Show, onMount, onCleanup } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type {
  Category,
  MasterItemWithCategory,
  BagTemplate,
  SelectedBuiltInItem,
} from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { AllItemsPageHeader } from './AllItemsPageHeader';
import { AllItemsPageTabs } from './AllItemsPageTabs';
import { BuiltInItemsBrowser } from '../built-in-items/BuiltInItemsBrowser';
import { fetchWithErrorHandling, fetchWithFallback } from '../../lib/resource-helpers';
import { resolveMasterItems } from '../../lib/item-helpers';
import { coalesced, syncManager } from '../../lib/sync-manager';

export function AllItemsPage() {
  const [showBuiltInItems, setShowBuiltInItems] = createSignal(false);

  const [categories, { refetch: refetchCategories, mutate: mutateCategories }] = createResource<
    Category[]
  >(() =>
    fetchWithFallback(
      () => api.get<Category[]>(endpoints.categories),
      [],
      'Failed to load categories'
    )
  );

  const [items, { refetch: refetchItems, mutate: mutateItems }] = createResource<
    MasterItemWithCategory[]
  >(() =>
    fetchWithErrorHandling(
      () => api.get<MasterItemWithCategory[]>(endpoints.masterItems),
      'Failed to load items'
    )
  );

  const [bagTemplates, { refetch: refetchBagTemplates }] = createResource<BagTemplate[]>(() =>
    fetchWithFallback(
      () => api.get<BagTemplate[]>(endpoints.bagTemplates),
      [],
      'Failed to load bags'
    )
  );

  onMount(() => {
    // Subscribe before any await so onCleanup still has an owner.
    syncManager.connect();
    onCleanup(() => syncManager.disconnect());
    onCleanup(syncManager.on('category', coalesced(refetchCategories)));
    onCleanup(syncManager.on('masterItem', coalesced(refetchItems)));
    onCleanup(syncManager.on('bagTemplate', coalesced(refetchBagTemplates)));

    void authStore.initAuth();
  });

  const handleDeleteItem = async (item: MasterItemWithCategory) => {
    const confirmed = await confirmDialog({
      title: `Delete “${item.name}”?`,
      message: 'Trips that already include it keep their copy.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    const response = await api.delete(endpoints.masterItem(item.id));
    if (response.success) {
      showToast('success', `Deleted ${item.name}`);
      mutateItems((prev) => prev?.filter((i) => i.id !== item.id));
    } else {
      showToast('error', response.error || 'Failed to delete item');
    }
  };

  const handleItemUpdated = (updated: MasterItemWithCategory) => {
    mutateItems((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)));
  };

  const handleItemAdded = (added: MasterItemWithCategory) => {
    mutateItems((prev) => [...(prev ?? []), added]);
    // Adding a Suggestion can create its category.
    if (added.category_id && !categories()?.some((c) => c.id === added.category_id)) {
      refetchCategories();
    }
  };

  const handleDataChanged = () => {
    refetchCategories();
    refetchItems();
  };

  // Adds Suggestions to My Items. Items already there (by name) are left as
  // the user saved them.
  const handleImportBuiltInItems = async (selected: SelectedBuiltInItem[]) => {
    const itemsCache = [...(items() ?? [])];
    const categoriesCache = [...(categories() ?? [])];
    const results = await resolveMasterItems(selected, itemsCache, categoriesCache);
    mutateItems(itemsCache);
    mutateCategories(categoriesCache);

    const count = (status: string) => results.filter((r) => r.status === status).length;
    const created = count('created');
    const existing = count('unchanged');
    const failed = count('failed');
    const parts = [`Added ${created} item${created === 1 ? '' : 's'} to My Items`];
    if (existing > 0) parts.push(`${existing} already there`);
    if (failed > 0) parts.push(`${failed} failed`);
    showToast(failed > 0 ? 'error' : 'success', parts.join(', '));
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <AllItemsPageHeader
        items={items}
        categories={categories}
        onDataChanged={handleDataChanged}
        onBrowseTemplates={() => setShowBuiltInItems(true)}
      />

      <main class="container mx-auto px-4 py-6 md:px-3 md:py-3">
        {/* Spinner on first load only: refetches keep the list (and any
            focus or scroll position) in place. */}
        <Show
          when={items.state !== 'pending' && items.state !== 'unresolved'}
          fallback={<LoadingSpinner text="Loading items..." />}
        >
          <Show
            when={!items.error}
            fallback={
              <EmptyState
                icon="⚠️"
                title="Unable to connect"
                description="Cannot reach the server. Please check your connection and try again."
                action={<Button onClick={() => refetchItems()}>Retry</Button>}
              />
            }
          >
            <AllItemsPageTabs
              items={items}
              categories={categories}
              bagTemplates={bagTemplates}
              onDeleteItem={handleDeleteItem}
              onItemUpdated={handleItemUpdated}
              onItemAdded={handleItemAdded}
              onCategoriesSaved={handleDataChanged}
              onBagTemplatesSaved={refetchBagTemplates}
            />
          </Show>
        </Show>
      </main>

      <Show when={showBuiltInItems()}>
        <BuiltInItemsBrowser
          onClose={() => setShowBuiltInItems(false)}
          onImportToMaster={handleImportBuiltInItems}
        />
      </Show>
    </div>
  );
}
