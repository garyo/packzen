import { createSignal, createResource, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripItem, Bag, Category, SelectedBuiltInItem } from '../../lib/types';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Toast, showToast } from '../ui/Toast';
import { getPackingProgress } from '../../lib/utils';
import { AddFromMasterList } from './AddFromMasterList';
import { BagManager } from './BagManager';
import { EditTripItem } from './EditTripItem';
import { AddTripItemForm } from './AddTripItemForm';
import { TripImportModal } from './TripImportModal';
import { PackingPageHeader } from './PackingPageHeader';
import { PackingListBagView } from './PackingListBagView';
import { PackingListCategoryView } from './PackingListCategoryView';
import { SelectModeActionBar } from './SelectModeActionBar';
import { BuiltInItemsBrowser } from '../built-in-items/BuiltInItemsBrowser';
import { builtInItems } from '../../lib/built-in-items';
import { fetchWithErrorHandling, fetchSingleWithErrorHandling } from '../../lib/resource-helpers';
import { tripToYAML, downloadYAML } from '../../lib/yaml';
import { deleteTripWithConfirm } from '../../lib/trip-actions';

interface PackingPageProps {
  tripId: string;
}

export function PackingPage(props: PackingPageProps) {
  const [showAddFromMaster, setShowAddFromMaster] = createSignal(false);
  const [showBagManager, setShowBagManager] = createSignal(false);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<TripItem | null>(null);
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedItems, setSelectedItems] = createSignal<Set<string>>(new Set());
  const [showImport, setShowImport] = createSignal(false);
  const [showBuiltInItems, setShowBuiltInItems] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<'bag' | 'category'>('bag');

  // Pre-selection for add modals
  const [preSelectedBagId, setPreSelectedBagId] = createSignal<string | null>(null);
  const [preSelectedContainerId, setPreSelectedContainerId] = createSignal<string | null>(null);

  const [items, { mutate, refetch }] = createResource<TripItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<TripItem[]>(endpoints.tripItems(props.tripId)),
      'Failed to load trip items'
    );
  });

  const [trip] = createResource<Trip | null>(async () => {
    return fetchSingleWithErrorHandling(
      () => api.get<Trip>(endpoints.trip(props.tripId)),
      'Failed to load trip'
    );
  });

  const [bags, { refetch: refetchBags }] = createResource<Bag[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Bag[]>(endpoints.tripBags(props.tripId)),
      'Failed to load bags'
    );
  });

  const [categories] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  onMount(async () => {
    await authStore.initAuth();
  });

  const handleTogglePacked = async (item: TripItem) => {
    // Optimistic update
    mutate((prev) => prev?.map((i) => (i.id === item.id ? { ...i, is_packed: !i.is_packed } : i)));

    const response = await api.patch(endpoints.tripItems(props.tripId), {
      id: item.id,
      is_packed: !item.is_packed,
    });

    if (!response.success) {
      showToast('error', response.error || 'Failed to update item');
      refetch(); // Revert on error
    }
  };

  const handleAddItem = () => {
    setShowAddForm(true);
  };

  // Open add modals with pre-selected bag or container
  const openAddForm = (bagId?: string, containerId?: string) => {
    setPreSelectedBagId(bagId || null);
    setPreSelectedContainerId(containerId || null);
    setShowAddForm(true);
  };

  const openAddFromMaster = (bagId?: string, containerId?: string) => {
    setPreSelectedBagId(bagId || null);
    setPreSelectedContainerId(containerId || null);
    setShowAddFromMaster(true);
  };

  const openBrowseTemplates = (bagId?: string, containerId?: string) => {
    setPreSelectedBagId(bagId || null);
    setPreSelectedContainerId(containerId || null);
    setShowBuiltInItems(true);
  };

  // Clear pre-selection when closing modals
  const closeAddForm = () => {
    setShowAddForm(false);
    setPreSelectedBagId(null);
    setPreSelectedContainerId(null);
  };

  const closeAddFromMaster = () => {
    setShowAddFromMaster(false);
    setPreSelectedBagId(null);
    setPreSelectedContainerId(null);
  };

  const closeBrowseTemplates = () => {
    setShowBuiltInItems(false);
    setPreSelectedBagId(null);
    setPreSelectedContainerId(null);
  };

  const toggleSelectMode = () => {
    setSelectMode(!selectMode());
    setSelectedItems(new Set<string>());
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set<string>(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleBatchAssignToBag = async (bagId: string | null) => {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    // Capture scroll position before update
    const scrollY = window.scrollY;

    try {
      await Promise.all(
        itemsToUpdate.map((itemId) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: itemId,
            bag_id: bagId,
            container_item_id: null, // Clear container when assigning to bag
          })
        )
      );

      showToast('success', `Assigned ${itemsToUpdate.length} items to bag`);
      await refetch();
      setSelectMode(false);
      setSelectedItems(new Set<string>());

      // Restore scroll position after refetch and re-render
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
      });
    } catch (error) {
      showToast('error', 'Failed to assign items');
    }
  };

  const handleBatchAssignToContainer = async (containerId: string | null) => {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    // Validate: can't assign containers to other containers
    const currentItems = items() || [];
    const selectedItemsData = currentItems.filter((item) => selectedItems().has(item.id));
    const hasContainers = selectedItemsData.some((item) => item.is_container);

    if (hasContainers && containerId) {
      showToast('error', 'Containers cannot be placed inside other containers');
      return;
    }

    // Capture scroll position before update
    const scrollY = window.scrollY;

    try {
      await Promise.all(
        itemsToUpdate.map((itemId) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: itemId,
            container_item_id: containerId,
            bag_id: null, // Clear bag when assigning to container
          })
        )
      );

      const containerName = containerId
        ? currentItems.find((item) => item.id === containerId)?.name || 'container'
        : 'no container';
      showToast('success', `Assigned ${itemsToUpdate.length} items to ${containerName}`);
      await refetch();
      setSelectMode(false);
      setSelectedItems(new Set<string>());

      // Restore scroll position after refetch and re-render
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
      });
    } catch (error) {
      showToast('error', 'Failed to assign items to container');
    }
  };

  const handleBatchAssignToCategory = async (categoryId: string | null) => {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    const categoryName = categoryId
      ? categories()?.find((cat) => cat.id === categoryId)?.name || null
      : null;

    // Capture scroll position before update
    const scrollY = window.scrollY;

    try {
      await Promise.all(
        itemsToUpdate.map((itemId) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: itemId,
            category_name: categoryName,
          })
        )
      );

      showToast(
        'success',
        `Assigned ${itemsToUpdate.length} items to ${categoryName || 'no category'}`
      );
      await refetch();
      setSelectMode(false);
      setSelectedItems(new Set<string>());

      // Restore scroll position after refetch and re-render
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
      });
    } catch (error) {
      showToast('error', 'Failed to assign items to category');
    }
  };

  const handleBatchDelete = async () => {
    const itemsToDelete = Array.from(selectedItems());
    if (itemsToDelete.length === 0) return;

    // Capture scroll position before update
    const scrollY = window.scrollY;

    try {
      await Promise.all(
        itemsToDelete.map((itemId) =>
          api.delete(endpoints.tripItems(props.tripId), {
            body: JSON.stringify({ id: itemId }),
          })
        )
      );

      showToast('success', `Deleted ${itemsToDelete.length} items`);
      await refetch();
      setSelectMode(false);
      setSelectedItems(new Set<string>());

      // Restore scroll position after refetch and re-render
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
      });
    } catch (error) {
      showToast('error', 'Failed to delete items');
    }
  };

  const handleExport = () => {
    const currentTrip = trip();
    const currentBags = bags() || [];
    const currentItems = items() || [];

    if (!currentTrip) {
      showToast('error', 'Trip data not loaded');
      return;
    }

    try {
      const yamlContent = tripToYAML(currentTrip, currentBags, currentItems);
      const filename = `${currentTrip.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.yaml`;
      downloadYAML(yamlContent, filename);
      showToast('success', 'Trip exported successfully');
    } catch (error) {
      showToast('error', 'Failed to export trip');
      console.error(error);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Unpack all items? This will mark all items as unpacked.')) return;

    const currentItems = items() || [];
    const packedItems = currentItems.filter((item) => item.is_packed);

    if (packedItems.length === 0) {
      showToast('error', 'No packed items to clear');
      return;
    }

    try {
      await Promise.all(
        packedItems.map((item) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: item.id,
            is_packed: false,
          })
        )
      );

      showToast('success', `Unpacked ${packedItems.length} items`);
      await refetch();
    } catch (error) {
      showToast('error', 'Failed to unpack items');
    }
  };

  const handleDeleteTrip = async () => {
    const currentTrip = trip();
    if (!currentTrip) return;

    await deleteTripWithConfirm(currentTrip.id, currentTrip.name, () => {
      // Navigate back to trips list
      window.location.href = '/trips';
    });
  };

  const handleAddBuiltInItemsToTrip = async (
    itemsToAdd: SelectedBuiltInItem[],
    bagId?: string | null,
    containerId?: string | null
  ) => {
    try {
      // Fetch current master items and categories
      const [masterItemsResponse, categoriesResponse] = await Promise.all([
        api.get(endpoints.masterItems),
        api.get(endpoints.categories),
      ]);

      if (!masterItemsResponse.success || !categoriesResponse.success) {
        throw new Error('Failed to fetch master items or categories');
      }

      const masterItems = masterItemsResponse.data as any[];
      const existingCategories = categoriesResponse.data as any[];

      // Helper to get or create category
      const getCategoryId = async (categoryName: string): Promise<string | null> => {
        let category = existingCategories.find(
          (c: any) => c.name.toLowerCase() === categoryName.toLowerCase()
        );

        if (!category) {
          // Get icon from built-in categories
          const builtInCategory = builtInItems.categories.find(
            (c) => c.name.toLowerCase() === categoryName.toLowerCase()
          );
          const response = await api.post(endpoints.categories, {
            name: categoryName,
            icon: builtInCategory?.icon || null,
          });
          if (response.success && response.data) {
            category = response.data;
            existingCategories.push(category);
          }
        }

        return category?.id || null;
      };

      // Helper to get or create master item
      const getMasterItemId = async (item: SelectedBuiltInItem): Promise<string | null> => {
        let masterItem = masterItems.find(
          (m: any) => m.name.toLowerCase() === item.name.toLowerCase()
        );

        if (!masterItem) {
          const categoryId = await getCategoryId(item.category);
          const response = await api.post(endpoints.masterItems, {
            name: item.name,
            description: item.description,
            category_id: categoryId,
            default_quantity: item.quantity,
          });

          if (response.success && response.data) {
            masterItem = response.data;
            masterItems.push(masterItem);
          }
        }

        return masterItem?.id || null;
      };

      // Add items to trip with master_item_id
      for (const item of itemsToAdd) {
        const masterItemId = await getMasterItemId(item);

        await api.post(endpoints.tripItems(props.tripId), {
          name: item.name,
          category_name: item.category,
          quantity: item.quantity,
          notes: item.description,
          bag_id: containerId ? null : bagId || null, // Clear bag if using container
          container_item_id: containerId || null,
          master_item_id: masterItemId,
        });
      }

      showToast('success', `Added ${itemsToAdd.length} items to trip and master list`);
      refetch();
    } catch (error) {
      showToast('error', 'Failed to add items');
      console.error('Error adding built-in items to trip:', error);
    }
  };

  const packedCount = () => items()?.filter((i) => i.is_packed).length || 0;
  const totalCount = () => items()?.length || 0;
  const progress = () => getPackingProgress(packedCount(), totalCount());

  // Get available containers for select mode
  const getContainers = () => {
    const currentItems = items() || [];
    return currentItems.filter((item) => item.is_container);
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      <PackingPageHeader
        trip={trip}
        packedCount={packedCount}
        totalCount={totalCount}
        progress={progress}
        selectMode={selectMode}
        sortBy={sortBy}
        onToggleSelectMode={toggleSelectMode}
        onToggleSortBy={() => setSortBy(sortBy() === 'bag' ? 'category' : 'bag')}
        onAddItem={handleAddItem}
        onManageBags={() => setShowBagManager(true)}
        onAddFromMaster={() => setShowAddFromMaster(true)}
        onBrowseTemplates={() => setShowBuiltInItems(true)}
        onExport={handleExport}
        onImport={() => setShowImport(true)}
        onClearAll={handleClearAll}
        onDeleteTrip={handleDeleteTrip}
      />

      {/* Packing List */}
      <main class="container mx-auto px-4 py-6 pb-20 md:px-3 md:py-3 md:pb-16">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={!items.error}
            fallback={
              <EmptyState
                icon="⚠️"
                title="Unable to connect"
                description="Cannot reach the server. Please check your connection and try again."
                action={<Button onClick={() => refetch()}>Retry</Button>}
              />
            }
          >
            <Show
              when={totalCount() > 0}
              fallback={
                <EmptyState
                  icon="📦"
                  title="No items yet"
                  description="Add items to your packing list to get started"
                />
              }
            >
              <Show
                when={sortBy() === 'bag'}
                fallback={
                  <PackingListCategoryView
                    items={items}
                    bags={bags}
                    categories={categories}
                    selectMode={selectMode}
                    selectedItems={selectedItems}
                    onTogglePacked={handleTogglePacked}
                    onEditItem={setEditingItem}
                    onToggleItemSelection={toggleItemSelection}
                  />
                }
              >
                <PackingListBagView
                  items={items}
                  bags={bags}
                  categories={categories}
                  selectMode={selectMode}
                  selectedItems={selectedItems}
                  onTogglePacked={handleTogglePacked}
                  onEditItem={setEditingItem}
                  onToggleItemSelection={toggleItemSelection}
                  onAddToBag={(bagId) => openAddForm(bagId)}
                  onAddToContainer={(containerId) => openAddForm(undefined, containerId)}
                  onAddFromMasterToBag={(bagId) => openAddFromMaster(bagId)}
                  onAddFromMasterToContainer={(containerId) =>
                    openAddFromMaster(undefined, containerId)
                  }
                  onBrowseTemplatesToBag={(bagId) => openBrowseTemplates(bagId)}
                  onBrowseTemplatesToContainer={(containerId) =>
                    openBrowseTemplates(undefined, containerId)
                  }
                />
              </Show>
            </Show>

            {/* Add Items Buttons - shown for both empty and non-empty states */}
            <div class="mt-6 flex flex-col items-center gap-3">
              <Button onClick={() => setShowBagManager(true)}>Add Bags</Button>
              <div class="flex flex-wrap justify-center gap-2">
                <Button onClick={() => openAddForm()}>Add Items</Button>
                <Button variant="secondary" onClick={() => openAddFromMaster()}>
                  Add from All Items
                </Button>
                <Button variant="secondary" onClick={() => openBrowseTemplates()}>
                  Add from Templates
                </Button>
              </div>
            </div>
          </Show>
        </Show>
      </main>

      {/* Add Item Form Modal */}
      <Show when={showAddForm()}>
        <AddTripItemForm
          tripId={props.tripId}
          preSelectedBagId={preSelectedBagId()}
          preSelectedContainerId={preSelectedContainerId()}
          onClose={closeAddForm}
          onSaved={() => refetch()}
        />
      </Show>

      {/* Edit Item Modal */}
      <Show when={editingItem()}>
        <EditTripItem
          tripId={props.tripId}
          item={editingItem()!}
          allItems={items()}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            refetch();
            refetchBags();
          }}
        />
      </Show>

      {/* Bag Manager Modal */}
      <Show when={showBagManager()}>
        <BagManager
          tripId={props.tripId}
          onClose={() => setShowBagManager(false)}
          onSaved={() => {
            refetch();
            refetchBags();
          }}
        />
      </Show>

      {/* Add from All Items Modal */}
      <Show when={showAddFromMaster()}>
        <AddFromMasterList
          tripId={props.tripId}
          preSelectedBagId={preSelectedBagId()}
          preSelectedContainerId={preSelectedContainerId()}
          onClose={closeAddFromMaster}
          onAdded={() => refetch()}
        />
      </Show>

      {/* Import Trip Modal */}
      <Show when={showImport()}>
        <TripImportModal
          tripId={props.tripId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            refetch();
            refetchBags();
          }}
        />
      </Show>

      {/* Built-in Items Browser Modal */}
      <Show when={showBuiltInItems()}>
        <BuiltInItemsBrowser
          tripId={props.tripId}
          onClose={closeBrowseTemplates}
          onAddToTrip={handleAddBuiltInItemsToTrip}
        />
      </Show>

      {/* Bottom Action Bar (Select Mode) */}
      <Show when={selectMode() && selectedItems().size > 0}>
        <SelectModeActionBar
          selectedCount={() => selectedItems().size}
          bags={bags}
          categories={categories}
          containers={getContainers}
          onAssignToBag={handleBatchAssignToBag}
          onAssignToContainer={handleBatchAssignToContainer}
          onAssignToCategory={handleBatchAssignToCategory}
          onDeleteAll={handleBatchDelete}
        />
      </Show>

      {/* Back Button */}
      <Show when={!selectMode() || selectedItems().size === 0}>
        <div class="fixed bottom-4 left-4">
          <a
            href="/trips"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 shadow-lg hover:bg-gray-50"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      </Show>
    </div>
  );
}
