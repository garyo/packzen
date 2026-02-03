import { createSignal, createResource, Show, onMount } from 'solid-js';
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
import { Toast, showToast } from '../ui/Toast';
import { AllItemsPageHeader } from './AllItemsPageHeader';
import { AllItemsPageTabs } from './AllItemsPageTabs';
import { BuiltInItemsBrowser } from '../built-in-items/BuiltInItemsBrowser';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';
import { getCategoryIcon } from '../../lib/built-in-items';

export function AllItemsPage() {
  const [showBuiltInItems, setShowBuiltInItems] = createSignal(false);

  // Fetch categories
  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  // Fetch all items
  const [items, { refetch: refetchItems }] = createResource<MasterItemWithCategory[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItemWithCategory[]>(endpoints.masterItems),
      'Failed to load items'
    );
  });

  // Fetch bag templates
  const [bagTemplates, { refetch: refetchBagTemplates }] = createResource<BagTemplate[]>(
    async () => {
      return fetchWithErrorHandling(
        () => api.get<BagTemplate[]>(endpoints.bagTemplates),
        'Failed to load bags'
      );
    }
  );

  // Initialize auth on mount
  onMount(async () => {
    await authStore.initAuth();
  });

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const response = await api.delete(endpoints.masterItem(id));
    if (response.success) {
      showToast('success', 'Item deleted successfully');
      refetchItems();
    } else {
      showToast('error', response.error || 'Failed to delete item');
    }
  };

  const handleDataChanged = () => {
    refetchCategories();
    refetchItems();
  };

  const handleBagTemplatesChanged = () => {
    refetchBagTemplates();
  };

  const handleImportBuiltInItems = async (itemsToImport: SelectedBuiltInItem[]) => {
    // Phase 1: Ensure all needed categories exist (parallel creation of missing ones)
    const categoryMap = new Map<string, string>();
    categories()?.forEach((c) => categoryMap.set(c.name.toLowerCase(), c.id));

    const uniqueCategories = [...new Set(itemsToImport.map((i) => i.category))];
    const missingCategories = uniqueCategories.filter(
      (name) => !categoryMap.has(name.toLowerCase())
    );

    const catResults = await Promise.all(
      missingCategories.map(async (name) => {
        const response = await api.post<Category>(endpoints.categories, {
          name,
          icon: getCategoryIcon(name),
          sort_order: (categories()?.length || 0) + missingCategories.indexOf(name),
        });
        return { name, id: response.success && response.data ? response.data.id : null };
      })
    );
    catResults.forEach(({ name, id }) => {
      if (id) categoryMap.set(name.toLowerCase(), id);
    });

    // Phase 2: Create/update all items in parallel
    const results = await Promise.all(
      itemsToImport.map(async (item) => {
        const categoryId = categoryMap.get(item.category.toLowerCase()) || null;
        const existingItem = items()?.find(
          (i) => i.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );

        if (existingItem) {
          const response = await api.patch(endpoints.masterItem(existingItem.id), {
            description: item.description,
            category_id: categoryId,
            default_quantity: item.quantity,
          });
          return response.success ? 'updated' : 'failed';
        } else {
          const response = await api.post(endpoints.masterItems, {
            name: item.name,
            description: item.description,
            category_id: categoryId,
            default_quantity: item.quantity,
          });
          return response.success ? 'created' : 'failed';
        }
      })
    );

    const created = results.filter((r) => r === 'created').length;
    const updated = results.filter((r) => r === 'updated').length;
    const messages = [];
    if (created > 0) messages.push(`${created} created`);
    if (updated > 0) messages.push(`${updated} updated`);

    showToast('success', `Imported ${itemsToImport.length} items (${messages.join(', ')})`);
    refetchItems();
    refetchCategories();
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      <AllItemsPageHeader
        items={items}
        categories={categories}
        onDataChanged={handleDataChanged}
        onBrowseTemplates={() => setShowBuiltInItems(true)}
      />

      {/* Main Content */}
      <main class="container mx-auto px-4 py-6 md:px-3 md:py-3">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
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
              onItemSaved={refetchItems}
              onCategoriesSaved={handleDataChanged}
              onBagTemplatesSaved={handleBagTemplatesChanged}
            />
          </Show>
        </Show>
      </main>

      {/* Modals */}
      <Show when={showBuiltInItems()}>
        <BuiltInItemsBrowser
          onClose={() => setShowBuiltInItems(false)}
          onImportToMaster={handleImportBuiltInItems}
        />
      </Show>
    </div>
  );
}
