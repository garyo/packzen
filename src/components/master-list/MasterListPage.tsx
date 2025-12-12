import { createSignal, createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Category, MasterItem } from '../../lib/types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast, showToast } from '../ui/Toast';
import { ItemForm } from './ItemForm';
import { CategoryManager } from './CategoryManager';
import { masterItemsToCSV, csvToMasterItems, downloadCSV } from '../../lib/csv';

export function MasterListPage() {
  const [showItemForm, setShowItemForm] = createSignal(false);
  const [showCategoryManager, setShowCategoryManager] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<MasterItem | null>(null);

  // Fetch categories
  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    const response = await api.get<Category[]>(endpoints.categories);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  // Fetch master items
  const [items, { refetch: refetchItems }] = createResource<MasterItem[]>(async () => {
    const response = await api.get<MasterItem[]>(endpoints.masterItems);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  // Initialize auth on mount
  onMount(async () => {
    await authStore.initAuth();
  });

  const handleAddItem = () => {
    setEditingItem(null);
    setShowItemForm(true);
  };

  const handleEditItem = (item: MasterItem) => {
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

  const handleExport = () => {
    const itemsList = items();
    if (!itemsList || itemsList.length === 0) {
      showToast('error', 'No items to export');
      return;
    }

    const csv = masterItemsToCSV(itemsList);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`master-list-${timestamp}.csv`, csv);
    showToast('success', 'Master list exported');
  };

  const handleImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedItems = csvToMasterItems(text);
      const existingItems = items() || [];
      const existingCategories = categories() || [];

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
            category = response.data;
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

      refetchItems();
      refetchCategories();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import CSV');
    } finally {
      input.value = ''; // Reset file input
    }
  };

  const getItemsByCategory = (categoryId: string | null) => {
    return items()?.filter((item) => item.category_id === categoryId) || [];
  };

  const uncategorizedItems = () => getItemsByCategory(null);

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      {/* Header */}
      <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a
                href="/dashboard"
                class="text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </a>
              <div>
                <h1 class="text-2xl font-bold text-gray-900">Master List</h1>
                <p class="text-sm text-gray-600">Your reusable packing essentials</p>
              </div>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCategoryManager(true)}>
                Categories
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport}>
                Export
              </Button>
              <label class="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 px-3 py-1.5 text-sm bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 cursor-pointer">
                Import
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  class="hidden"
                />
              </label>
              <Button size="sm" onClick={handleAddItem}>
                + Add Item
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="container mx-auto px-4 py-6">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={(items()?.length || 0) > 0}
            fallback={
              <EmptyState
                icon="📝"
                title="No items yet"
                description="Start building your master packing list by adding your first item"
                action={<Button onClick={handleAddItem}>Add Your First Item</Button>}
              />
            }
          >
            <div class="space-y-6">
              {/* Categories */}
              <For each={categories()}>
                {(category) => {
                  const categoryItems = () => getItemsByCategory(category.id);
                  return (
                    <Show when={categoryItems().length > 0}>
                      <div class="bg-white rounded-lg shadow-sm p-4">
                        <div class="flex items-center gap-2 mb-4">
                          <span class="text-2xl">{category.icon || '📦'}</span>
                          <h2 class="text-lg font-semibold text-gray-900">{category.name}</h2>
                          <span class="text-sm text-gray-500">({categoryItems().length})</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          <For each={categoryItems()}>
                            {(item) => (
                              <div class="border border-gray-200 rounded-lg p-3 hover:border-blue-500 transition-colors">
                                <div class="flex items-start justify-between">
                                  <div class="flex-1">
                                    <h3 class="font-medium text-gray-900">{item.name}</h3>
                                    {item.description && (
                                      <p class="text-sm text-gray-600 mt-1">{item.description}</p>
                                    )}
                                    <p class="text-xs text-gray-500 mt-1">
                                      Qty: {item.default_quantity}
                                    </p>
                                  </div>
                                  <div class="flex gap-1 ml-2">
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      class="p-1 text-gray-400 hover:text-blue-600"
                                      aria-label="Edit"
                                    >
                                      <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                          stroke-width="2"
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      class="p-1 text-gray-400 hover:text-red-600"
                                      aria-label="Delete"
                                    >
                                      <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                          stroke-width="2"
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  );
                }}
              </For>

              {/* Uncategorized */}
              <Show when={uncategorizedItems().length > 0}>
                <div class="bg-white rounded-lg shadow-sm p-4">
                  <h2 class="text-lg font-semibold text-gray-900 mb-4">
                    Uncategorized ({uncategorizedItems().length})
                  </h2>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <For each={uncategorizedItems()}>
                      {(item) => (
                        <div class="border border-gray-200 rounded-lg p-3 hover:border-blue-500 transition-colors">
                          <div class="flex items-start justify-between">
                            <div class="flex-1">
                              <h3 class="font-medium text-gray-900">{item.name}</h3>
                              {item.description && (
                                <p class="text-sm text-gray-600 mt-1">{item.description}</p>
                              )}
                              <p class="text-xs text-gray-500 mt-1">
                                Qty: {item.default_quantity}
                              </p>
                            </div>
                            <div class="flex gap-1 ml-2">
                              <button
                                onClick={() => handleEditItem(item)}
                                class="p-1 text-gray-400 hover:text-blue-600"
                                aria-label="Edit"
                              >
                                <svg
                                  class="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                class="p-1 text-gray-400 hover:text-red-600"
                                aria-label="Delete"
                              >
                                <svg
                                  class="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
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
          onSaved={() => {
            refetchCategories();
            refetchItems();
          }}
        />
      </Show>

      {/* Back Button */}
      <div class="fixed bottom-4 left-4">
        <a
          href="/dashboard"
          class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-md hover:bg-gray-50"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </a>
      </div>
    </div>
  );
}
