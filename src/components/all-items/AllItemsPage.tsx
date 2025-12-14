import { createSignal, createResource, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Category, MasterItemWithCategory, BagTemplate } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { ItemForm } from './ItemForm';
import { CategoryManager } from './CategoryManager';
import { BagTemplateManager } from '../bag-templates/BagTemplateManager';
import { AllItemsPageHeader } from './AllItemsPageHeader';
import { ItemsList } from './ItemsList';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';

export function AllItemsPage() {
  const [showItemForm, setShowItemForm] = createSignal(false);
  const [showCategoryManager, setShowCategoryManager] = createSignal(false);
  const [showBagTemplateManager, setShowBagTemplateManager] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<MasterItemWithCategory | null>(null);

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
  const [bagTemplates, { refetch: refetchBagTemplates }] = createResource<BagTemplate[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<BagTemplate[]>(endpoints.bagTemplates),
      'Failed to load bags'
    );
  });

  // Initialize auth on mount
  onMount(async () => {
    await authStore.initAuth();
  });

  const handleAddItem = () => {
    setEditingItem(null);
    setShowItemForm(true);
  };

  const handleEditItem = (item: MasterItemWithCategory) => {
    setEditingItem(item);
    setShowItemForm(true);
  };

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

  const handleItemSaved = () => {
    setShowItemForm(false);
    setEditingItem(null);
    refetchItems();
  };

  const handleDataChanged = () => {
    refetchCategories();
    refetchItems();
  };

  const handleBagTemplatesChanged = () => {
    refetchBagTemplates();
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      <AllItemsPageHeader
        items={items}
        categories={categories}
        onAddItem={handleAddItem}
        onManageCategories={() => setShowCategoryManager(true)}
        onManageBagTemplates={() => setShowBagTemplateManager(true)}
        onDataChanged={handleDataChanged}
      />

      {/* Main Content */}
      <main class="container mx-auto px-4 py-6 md:px-3 md:py-3">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={(items()?.length || 0) > 0}
            fallback={
              <EmptyState
                icon="📝"
                title="No items yet"
                description="Start building your packing list by adding your first item"
                action={<Button onClick={handleAddItem}>Add Your First Item</Button>}
              />
            }
          >
            <ItemsList
              items={items}
              categories={categories}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
            />
          </Show>
        </Show>
      </main>

      {/* Modals */}
      <Show when={showItemForm()}>
        <ItemForm
          item={editingItem()}
          categories={categories() || []}
          onClose={() => {
            setShowItemForm(false);
            setEditingItem(null);
          }}
          onSaved={handleItemSaved}
        />
      </Show>

      <Show when={showCategoryManager()}>
        <CategoryManager
          categories={categories() || []}
          onClose={() => setShowCategoryManager(false)}
          onSaved={handleDataChanged}
        />
      </Show>

      <Show when={showBagTemplateManager()}>
        <BagTemplateManager
          templates={bagTemplates() || []}
          onClose={() => setShowBagTemplateManager(false)}
          onSaved={handleBagTemplatesChanged}
        />
      </Show>
    </div>
  );
}
