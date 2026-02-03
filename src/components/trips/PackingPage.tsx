import {
  createSignal,
  createResource,
  Show,
  onMount,
  createMemo,
  createEffect,
  onCleanup,
} from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type {
  Trip,
  TripItem,
  Bag,
  Category,
  SelectedBuiltInItem,
  MasterItemWithCategory,
} from '../../lib/types';
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
import { AddModeView } from './AddModeView';
import { SelectModeActionBar } from './SelectModeActionBar';
import { BuiltInItemsBrowser } from '../built-in-items/BuiltInItemsBrowser';
import { builtInItems } from '../../lib/built-in-items';
import { fetchWithErrorHandling, fetchSingleWithErrorHandling } from '../../lib/resource-helpers';
import { syncManager } from '../../lib/sync-manager';
import { tripToYAML, downloadYAML } from '../../lib/yaml';
import { deleteTripWithConfirm } from '../../lib/trip-actions';
import { TripForm } from './TripForm';
import { ChevronLeftIcon } from '../ui/Icons';

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
  const [showEditTrip, setShowEditTrip] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<'bag' | 'category'>('bag');
  const [viewMode, setViewMode] = createSignal<'pack' | 'add'>('pack');
  const [showUnpackedOnly, setShowUnpackedOnly] = createSignal(false);
  const [showNotesPanel, setShowNotesPanel] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = createSignal('');
  const [pendingScrollItemId, setPendingScrollItemId] = createSignal<string | null>(null);

  // Debounce search query to avoid filtering on every keystroke
  createEffect(() => {
    const query = searchQuery();
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(query);
    }, 200); // 200ms delay

    onCleanup(() => clearTimeout(timeoutId));
  });

  // Pre-selection for add modals
  const [preSelectedBagId, setPreSelectedBagId] = createSignal<string | null>(null);
  const [preSelectedContainerId, setPreSelectedContainerId] = createSignal<string | null>(null);

  // Items store - fine-grained reactivity for scroll-stable updates
  const [itemsState, setItemsState] = createStore<{
    data: TripItem[];
    loading: boolean;
    error: string | null;
  }>({
    data: [],
    loading: true,
    error: null,
  });

  // Accessor for compatibility with existing code that uses items()
  const items = () => (itemsState.loading ? undefined : itemsState.data);

  // Track last fetch time for debouncing (declared here, used by silentRefresh below)
  let lastFetchTime = 0;

  // Fetch items from server and populate store
  const fetchItems = async () => {
    setItemsState('loading', true);
    setItemsState('error', null);
    try {
      const result = await fetchWithErrorHandling(
        () => api.get<TripItem[]>(endpoints.tripItems(props.tripId)),
        'Failed to load trip items'
      );
      setItemsState('data', result);
      setItemsState('loading', false);
      lastFetchTime = Date.now();
    } catch (e) {
      setItemsState('error', e instanceof Error ? e.message : 'Failed to load items');
      setItemsState('loading', false);
    }
  };

  // Alias for compatibility with existing refetch() calls
  const refetch = fetchItems;

  // Silent refresh - updates data without showing loading state (for background sync)
  const REFETCH_DEBOUNCE_MS = 5000; // Don't refetch if we just fetched within 5 seconds

  const silentRefresh = async () => {
    const now = Date.now();
    if (now - lastFetchTime < REFETCH_DEBOUNCE_MS) return;
    lastFetchTime = now;

    try {
      const result = await api.get<TripItem[]>(endpoints.tripItems(props.tripId));
      if (result.success && result.data) {
        // Use reconcile for efficient diffing - only updates changed items
        setItemsState('data', reconcile(result.data));
      }
    } catch {
      // Silent failure - don't disrupt the user
    }
  };

  // Refresh data when tab becomes visible (handles multi-device sync)
  createEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        silentRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    onCleanup(() => document.removeEventListener('visibilitychange', handleVisibilityChange));
  });

  // Store mutation helpers - these provide fine-grained updates without re-rendering entire list

  // Update a single item property (e.g., toggle is_packed)
  const updateItemInStore = (itemId: string, updates: Partial<TripItem>) => {
    setItemsState(
      'data',
      (item) => item.id === itemId,
      produce((item) => Object.assign(item, updates))
    );
  };

  // Update multiple items at once
  const updateItemsInStore = (itemIds: string[], updates: Partial<TripItem>) => {
    const idSet = new Set(itemIds);
    setItemsState(
      'data',
      (item) => idSet.has(item.id),
      produce((item) => Object.assign(item, updates))
    );
  };

  // Delete items from store
  const deleteItemsFromStore = (itemIds: string[]) => {
    const idSet = new Set(itemIds);
    setItemsState(
      produce((state) => {
        state.data = state.data.filter((item) => !idSet.has(item.id));
      })
    );
  };

  // Add item to store
  const addItemToStore = (item: TripItem) => {
    setItemsState(
      produce((state) => {
        state.data.push(item);
      })
    );
  };

  // Initial fetch on mount (auth init happens later in another onMount)

  const [trip, { refetch: refetchTrip }] = createResource<Trip | null>(async () => {
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

  const [masterItems, { refetch: refetchMasterItems }] = createResource<MasterItemWithCategory[]>(
    async () => {
      return fetchWithErrorHandling(
        () => api.get<MasterItemWithCategory[]>(endpoints.masterItems),
        'Failed to load master items'
      );
    }
  );

  const filteredItems = createMemo(() => {
    const allItems = items();
    if (!allItems) return undefined;
    const query = debouncedSearchQuery().trim().toLowerCase();
    if (!query) return allItems;

    const containerNames = new Map(
      allItems.filter((item) => item.is_container).map((item) => [item.id, item.name])
    );
    const bagNames = new Map((bags() || []).map((bag) => [bag.id, bag.name]));

    const matches = new Set<string>();
    const includesQuery = (value?: string | null) =>
      value ? value.toLowerCase().includes(query) : false;

    allItems.forEach((item) => {
      const containerName = item.container_item_id
        ? containerNames.get(item.container_item_id) || ''
        : '';
      const bagName = item.bag_id ? bagNames.get(item.bag_id) || '' : '';
      const fields = [item.name, item.category_name, containerName, bagName, item.notes];

      if (fields.some((field) => includesQuery(field))) {
        matches.add(item.id);
        if (item.container_item_id) {
          matches.add(item.container_item_id);
        }
      }
    });

    if (matches.size === 0) return [];
    return allItems.filter((item) => matches.has(item.id));
  });

  const visibleItems = () => filteredItems();
  const isSearching = createMemo(() => searchQuery().trim().length > 0);
  const hasSearchResults = createMemo(() => (visibleItems()?.length || 0) > 0);
  const noSearchResults = createMemo(() => isSearching() && !hasSearchResults());
  const visibleItemsCount = () => visibleItems()?.length || 0;

  createEffect(() => {
    const targetId = pendingScrollItemId();
    if (!targetId) return;
    if (isSearching()) return;

    requestAnimationFrame(() => {
      const element = document.getElementById(`trip-item-${targetId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setPendingScrollItemId(null);
    });
  });

  onMount(async () => {
    await authStore.initAuth();
    fetchItems();

    // Connect to SSE sync for multi-device updates
    syncManager.connect();
    onCleanup(() => syncManager.disconnect());

    // Subscribe to trip item changes for this trip
    const unsubTripItem = syncManager.on('tripItem', (change) => {
      if (change.parentId !== props.tripId) return;
      switch (change.action) {
        case 'create':
          addItemToStore(change.data);
          break;
        case 'update':
          updateItemInStore(change.entityId, change.data);
          break;
        case 'delete':
          deleteItemsFromStore([change.entityId]);
          break;
      }
    });
    onCleanup(unsubTripItem);

    // Subscribe to bag changes for this trip
    const unsubBag = syncManager.on('bag', (change) => {
      if (change.parentId !== props.tripId) return;
      refetchBags();
    });
    onCleanup(unsubBag);

    // Subscribe to trip metadata changes
    const unsubTrip = syncManager.on('trip', (change) => {
      if (change.entityId !== props.tripId) return;
      refetchTrip();
    });
    onCleanup(unsubTrip);
  });

  // Start in Add Mode if trip has no items (first time load only)
  let hasSetInitialMode = false;
  createEffect(() => {
    const loadedItems = items();
    if (!hasSetInitialMode && loadedItems !== undefined) {
      hasSetInitialMode = true;
      if (loadedItems.length === 0) {
        setViewMode('add');
      }
    }
  });

  // Generic optimistic toggle with undo support
  async function handleToggleField(
    item: TripItem,
    field: 'is_packed' | 'is_skipped',
    actionLabel: string
  ) {
    const newValue = !item[field];
    const originalValue = item[field];

    updateItemInStore(item.id, { [field]: newValue });

    try {
      const response = await api.patch(endpoints.tripItems(props.tripId), {
        id: item.id,
        [field]: newValue,
      });

      if (!response.success) {
        showToast('error', response.error || 'Failed to update item');
        updateItemInStore(item.id, { [field]: originalValue });
      } else {
        const actionText = newValue ? actionLabel : `un${actionLabel}`;
        showToast('info', `${item.name} ${actionText}`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              updateItemInStore(item.id, { [field]: originalValue });
              try {
                await api.patch(endpoints.tripItems(props.tripId), {
                  id: item.id,
                  [field]: originalValue,
                });
              } catch {
                showToast('error', 'Failed to undo');
                updateItemInStore(item.id, { [field]: newValue });
              }
            },
          },
        });
      }
    } catch {
      showToast('error', 'Failed to update item');
      updateItemInStore(item.id, { [field]: originalValue });
    }
  }

  const handleTogglePacked = (item: TripItem) => handleToggleField(item, 'is_packed', 'packed');
  const handleToggleSkipped = (item: TripItem) => handleToggleField(item, 'is_skipped', 'skipped');

  async function handleUpdateQuantity(item: TripItem, quantity: number) {
    const originalQuantity = item.quantity;
    updateItemInStore(item.id, { quantity });
    try {
      const response = await api.patch(endpoints.tripItems(props.tripId), {
        id: item.id,
        quantity,
      });
      if (!response.success) {
        showToast('error', response.error || 'Failed to update quantity');
        updateItemInStore(item.id, { quantity: originalQuantity });
      }
    } catch {
      showToast('error', 'Failed to update quantity');
      updateItemInStore(item.id, { quantity: originalQuantity });
    }
  }

  const handleAddItem = () => {
    setShowAddForm(true);
  };

  const openEditItem = (item: TripItem) => {
    setEditingItem(item);
  };

  const handleEditItemSaved = async (updatedItem?: TripItem) => {
    // If we got the updated item back, update store directly (no refetch needed)
    if (updatedItem) {
      updateItemInStore(updatedItem.id, updatedItem);
    } else {
      // Fallback: refetch if we don't have the updated data
      await refetch();
    }
    await refetchBags();
  };

  const handleEditItemDeleted = (deletedItemId: string, movedItemIds?: string[]) => {
    // If items were moved out of a container, update them first (before deleting container)
    if (movedItemIds && movedItemIds.length > 0) {
      const deletedItem = items()?.find((i) => i.id === deletedItemId);
      const inheritedBagId = deletedItem?.bag_id || null;
      updateItemsInStore(movedItemIds, {
        container_item_id: null,
        bag_id: inheritedBagId,
      });
    }

    // Remove the deleted item from store
    deleteItemsFromStore([deletedItemId]);
  };

  // Open add modals with pre-selected bag or container
  function openModalWithPreSelection(
    setter: (v: boolean) => void,
    bagId?: string,
    containerId?: string
  ) {
    setPreSelectedBagId(bagId || null);
    setPreSelectedContainerId(containerId || null);
    setter(true);
  }

  function closeModalWithPreSelection(setter: (v: boolean) => void) {
    setter(false);
    setPreSelectedBagId(null);
    setPreSelectedContainerId(null);
  }

  const openAddForm = (bagId?: string, containerId?: string) =>
    openModalWithPreSelection(setShowAddForm, bagId, containerId);
  const openAddFromMaster = (bagId?: string, containerId?: string) =>
    openModalWithPreSelection(setShowAddFromMaster, bagId, containerId);
  const openBrowseTemplates = (bagId?: string, containerId?: string) =>
    openModalWithPreSelection(setShowBuiltInItems, bagId, containerId);

  const closeAddForm = () => closeModalWithPreSelection(setShowAddForm);
  const closeAddFromMaster = () => closeModalWithPreSelection(setShowAddFromMaster);
  const closeBrowseTemplates = () => closeModalWithPreSelection(setShowBuiltInItems);

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

    // Capture previous state for rollback
    const previousStates = new Map(
      itemsToUpdate.map((id) => {
        const item = items()?.find((i) => i.id === id);
        return [
          id,
          { bag_id: item?.bag_id ?? null, container_item_id: item?.container_item_id ?? null },
        ];
      })
    );

    // Optimistic update using store - no scroll disruption
    updateItemsInStore(itemsToUpdate, { bag_id: bagId, container_item_id: null });

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
      setSelectMode(false);
      setSelectedItems(new Set<string>());
    } catch (error) {
      showToast('error', 'Failed to assign items');
      // Restore previous state instead of full refetch
      previousStates.forEach((state, id) => {
        updateItemInStore(id, state);
      });
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

    // Capture previous state for rollback
    const previousStates = new Map(
      itemsToUpdate.map((id) => {
        const item = currentItems.find((i) => i.id === id);
        return [
          id,
          { bag_id: item?.bag_id ?? null, container_item_id: item?.container_item_id ?? null },
        ];
      })
    );

    // Optimistic update using store - no scroll disruption
    updateItemsInStore(itemsToUpdate, { container_item_id: containerId, bag_id: null });

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
      setSelectMode(false);
      setSelectedItems(new Set<string>());
    } catch (error) {
      showToast('error', 'Failed to assign items to container');
      // Restore previous state instead of full refetch
      previousStates.forEach((state, id) => {
        updateItemInStore(id, state);
      });
    }
  };

  const handleBatchAssignToCategory = async (categoryId: string | null) => {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    const categoryName = categoryId
      ? categories()?.find((cat) => cat.id === categoryId)?.name || null
      : null;

    // Capture previous state for rollback
    const previousCategories = new Map(
      itemsToUpdate.map((id) => {
        const item = items()?.find((i) => i.id === id);
        return [id, item?.category_name ?? null];
      })
    );

    // Optimistic update using store - no scroll disruption
    updateItemsInStore(itemsToUpdate, { category_name: categoryName });

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
      setSelectMode(false);
      setSelectedItems(new Set<string>());
    } catch (error) {
      showToast('error', 'Failed to assign items to category');
      // Restore previous state instead of full refetch
      previousCategories.forEach((prevCategoryName, id) => {
        updateItemInStore(id, { category_name: prevCategoryName });
      });
    }
  };

  async function handleBatchSetSkipped(skip: boolean) {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    updateItemsInStore(itemsToUpdate, { is_skipped: skip });

    try {
      await Promise.all(
        itemsToUpdate.map((itemId) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: itemId,
            is_skipped: skip,
          })
        )
      );

      const label = skip ? 'Skipped' : 'Unskipped';
      showToast('success', `${label} ${itemsToUpdate.length} items`);
      setSelectMode(false);
      setSelectedItems(new Set<string>());
    } catch {
      showToast('error', `Failed to ${skip ? 'skip' : 'unskip'} items`);
      updateItemsInStore(itemsToUpdate, { is_skipped: !skip });
    }
  }

  const handleBatchSkip = () => handleBatchSetSkipped(true);
  const handleBatchUnskip = () => handleBatchSetSkipped(false);

  const handleBatchDelete = async () => {
    const itemsToDelete = Array.from(selectedItems());
    if (itemsToDelete.length === 0) return;

    // Capture deleted items for rollback
    const deletedItems = items()?.filter((item) => selectedItems().has(item.id)) || [];

    // Optimistic delete using store - no scroll disruption
    deleteItemsFromStore(itemsToDelete);

    try {
      await Promise.all(
        itemsToDelete.map((itemId) =>
          api.delete(endpoints.tripItems(props.tripId), {
            body: JSON.stringify({ id: itemId }),
          })
        )
      );

      showToast('success', `Deleted ${itemsToDelete.length} items`);
      setSelectMode(false);
      setSelectedItems(new Set<string>());
    } catch (error) {
      showToast('error', 'Failed to delete items');
      // Restore deleted items instead of full refetch
      deletedItems.forEach((item) => addItemToStore(item));
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

    const packedItemIds = packedItems.map((item) => item.id);

    // Optimistic update using store
    updateItemsInStore(packedItemIds, { is_packed: false });

    try {
      await Promise.all(
        packedItems.map((item) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: item.id,
            is_packed: false,
          })
        )
      );

      showToast('info', `Unpacked ${packedItems.length} items`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            updateItemsInStore(packedItemIds, { is_packed: true });
            try {
              await Promise.all(
                packedItems.map((item) =>
                  api.patch(endpoints.tripItems(props.tripId), {
                    id: item.id,
                    is_packed: true,
                  })
                )
              );
            } catch {
              showToast('error', 'Failed to undo');
              updateItemsInStore(packedItemIds, { is_packed: false });
            }
          },
        },
      });
    } catch (error) {
      showToast('error', 'Failed to unpack items');
      // Restore packed state instead of full refetch
      updateItemsInStore(packedItemIds, { is_packed: true });
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

  // Handler for updating trip notes
  const handleUpdateTripNotes = async (notes: string) => {
    const currentTrip = trip();
    if (!currentTrip) return;

    try {
      const response = await api.patch(endpoints.trip(props.tripId), { notes });
      if (response.success) {
        // Refetch trip to update local state
        refetchTrip();
      } else {
        showToast('error', response.error || 'Failed to save notes');
      }
    } catch {
      showToast('error', 'Failed to save notes');
    }
  };

  // Helper to get bag name for display
  const getBagName = (bagId: string | null) => {
    if (!bagId) return 'No Bag';
    return bags()?.find((b) => b.id === bagId)?.name || 'Unknown Bag';
  };

  // Drag-and-drop handlers with undo support
  const handleMoveItemToBag = async (itemId: string, bagId: string | null) => {
    const item = items()?.find((i) => i.id === itemId);
    // Skip if nothing would change (same bag AND not in a container)
    if (!item || (item.bag_id === bagId && !item.container_item_id)) return;

    // Capture previous state for undo
    const previousBagId = item.bag_id;
    const previousContainerId = item.container_item_id;
    const itemName = item.name;

    // Optimistic update using store - no scroll disruption
    updateItemInStore(itemId, { bag_id: bagId, container_item_id: null });

    const response = await api.patch(endpoints.tripItems(props.tripId), {
      id: itemId,
      bag_id: bagId,
      container_item_id: null,
    });

    if (!response.success) {
      showToast('error', response.error || 'Failed to move item');
      // Revert on error
      updateItemInStore(itemId, { bag_id: previousBagId, container_item_id: previousContainerId });
    } else {
      // Show undo toast
      showToast('info', `Moved "${itemName}" to ${getBagName(bagId)}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            // Optimistic undo using store
            updateItemInStore(itemId, {
              bag_id: previousBagId,
              container_item_id: previousContainerId,
            });
            const undoResponse = await api.patch(endpoints.tripItems(props.tripId), {
              id: itemId,
              bag_id: previousBagId,
              container_item_id: previousContainerId,
            });
            if (!undoResponse.success) {
              showToast('error', 'Failed to undo');
              refetch();
            }
          },
        },
      });
    }
  };

  const handleMoveItemToContainer = async (itemId: string, containerId: string) => {
    const item = items()?.find((i) => i.id === itemId);
    const container = items()?.find((i) => i.id === containerId);
    if (!item || !container) return;

    // Skip if already in this container
    if (item.container_item_id === containerId) return;

    // Prevent containers from being nested
    if (item.is_container) {
      showToast('error', "Containers can't go inside other containers");
      return;
    }

    // Capture previous state for undo
    const previousContainerId = item.container_item_id;
    const previousBagId = item.bag_id;
    const itemName = item.name;
    const containerName = container.name;

    // Optimistic update using store - no scroll disruption
    updateItemInStore(itemId, { container_item_id: containerId, bag_id: null });

    const response = await api.patch(endpoints.tripItems(props.tripId), {
      id: itemId,
      container_item_id: containerId,
      bag_id: null,
    });

    if (!response.success) {
      showToast('error', response.error || 'Failed to move item');
      // Revert on error
      updateItemInStore(itemId, { container_item_id: previousContainerId, bag_id: previousBagId });
    } else {
      // Show undo toast
      showToast('info', `Moved "${itemName}" to ${containerName}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            // Optimistic undo using store
            updateItemInStore(itemId, {
              container_item_id: previousContainerId,
              bag_id: previousBagId,
            });
            const undoResponse = await api.patch(endpoints.tripItems(props.tripId), {
              id: itemId,
              container_item_id: previousContainerId,
              bag_id: previousBagId,
            });
            if (!undoResponse.success) {
              showToast('error', 'Failed to undo');
              refetch();
            }
          },
        },
      });
    }
  };

  /**
   * Ensure master items and categories are loaded, fetching from API if needed.
   * Returns mutable arrays that helpers can append to (for caching new creates).
   */
  async function ensureResourcesLoaded(): Promise<{
    masterItemsList: any[];
    categoriesList: any[];
  }> {
    let masterItemsList: any[] = masterItems() ? [...masterItems()!] : [];
    let categoriesList: any[] = categories() ? [...categories()!] : [];

    if (!masterItemsList.length || !categoriesList.length) {
      const [masterItemsResponse, categoriesResponse] = await Promise.all([
        masterItemsList.length
          ? Promise.resolve({ success: true, data: masterItemsList })
          : api.get(endpoints.masterItems),
        categoriesList.length
          ? Promise.resolve({ success: true, data: categoriesList })
          : api.get(endpoints.categories),
      ]);

      if (!masterItemsResponse.success || !categoriesResponse.success) {
        throw new Error('Failed to fetch master items or categories');
      }

      masterItemsList = masterItemsResponse.data as any[];
      categoriesList = categoriesResponse.data as any[];
    }

    return { masterItemsList, categoriesList };
  }

  /** Get or create a category by name, appending to the cache array */
  async function getOrCreateCategory(
    categoryName: string,
    categoriesList: any[]
  ): Promise<string | null> {
    let category = categoriesList.find(
      (c: any) => c.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!category) {
      const builtInCategory = builtInItems.categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      const response = await api.post(endpoints.categories, {
        name: categoryName,
        icon: builtInCategory?.icon || null,
      });
      if (response.success && response.data) {
        category = response.data;
        categoriesList.push(category);
      }
    }

    return category?.id || null;
  }

  /** Get or create a master item, appending to the cache array */
  async function getOrCreateMasterItem(
    item: {
      name: string;
      description: string | null;
      category: string;
      quantity: number;
      is_container?: boolean;
    },
    masterItemsList: any[],
    categoriesList: any[]
  ): Promise<string | null> {
    let masterItem = masterItemsList.find(
      (m: any) => m.name.toLowerCase() === item.name.toLowerCase()
    );

    if (!masterItem) {
      const categoryId = await getOrCreateCategory(item.category, categoriesList);
      const response = await api.post(endpoints.masterItems, {
        name: item.name,
        description: item.description,
        category_id: categoryId,
        default_quantity: item.quantity,
        is_container: item.is_container || false,
      });

      if (response.success && response.data) {
        masterItem = response.data;
        masterItemsList.push(masterItem);
      }
    }

    return masterItem?.id || null;
  }

  const handleAddBuiltInItemsToTrip = async (
    itemsToAdd: SelectedBuiltInItem[],
    bagId?: string | null,
    containerId?: string | null
  ) => {
    try {
      const { masterItemsList, categoriesList } = await ensureResourcesLoaded();

      for (const item of itemsToAdd) {
        const masterItemId = await getOrCreateMasterItem(item, masterItemsList, categoriesList);

        const response = await api.post(endpoints.tripItems(props.tripId), {
          name: item.name,
          category_name: item.category,
          quantity: item.quantity,
          notes: item.description,
          bag_id: containerId ? null : bagId || null,
          container_item_id: containerId || null,
          master_item_id: masterItemId,
          is_container: item.is_container || false,
        });

        if (response.success && response.data) {
          addItemToStore(response.data as TripItem);
        }
      }

      showToast('success', `Added ${itemsToAdd.length} items to trip and master list`);
      refetchMasterItems();
    } catch (error) {
      showToast('error', 'Failed to add items');
      console.error('Error adding built-in items to trip:', error);
    }
  };

  // Handler for adding master items from Add mode drag-drop
  const handleAddMasterItemFromAddMode = async (
    masterItem: MasterItemWithCategory,
    bagId: string | null,
    containerId: string | null
  ) => {
    try {
      const response = await api.post(endpoints.tripItems(props.tripId), {
        name: masterItem.name,
        category_name: masterItem.category_name,
        quantity: masterItem.default_quantity || 1,
        master_item_id: masterItem.id,
        bag_id: containerId ? null : bagId,
        container_item_id: containerId,
        is_container: masterItem.is_container || false,
      });

      if (response.success && response.data) {
        addItemToStore(response.data as TripItem);
        showToast('success', `Added ${masterItem.name}`);
      } else {
        showToast('error', (response as any).error || 'Failed to add item');
      }
    } catch (error) {
      showToast('error', 'Failed to add item');
      console.error('Error adding master item from Add mode:', error);
    }
  };

  // Handler for adding built-in items from Add mode drag-drop
  const handleAddBuiltInItemFromAddMode = async (
    item: {
      name: string;
      description: string | null;
      category: string;
      quantity: number;
      is_container?: boolean;
    },
    bagId: string | null,
    containerId: string | null
  ) => {
    try {
      const { masterItemsList, categoriesList } = await ensureResourcesLoaded();
      const masterItemId = await getOrCreateMasterItem(item, masterItemsList, categoriesList);

      const tripItemResponse = await api.post(endpoints.tripItems(props.tripId), {
        name: item.name,
        category_name: item.category,
        quantity: item.quantity,
        notes: item.description,
        bag_id: containerId ? null : bagId,
        container_item_id: containerId,
        master_item_id: masterItemId,
        is_container: item.is_container || false,
      });

      if (tripItemResponse.success && tripItemResponse.data) {
        addItemToStore(tripItemResponse.data as TripItem);
        refetchMasterItems();
        showToast('success', `Added ${item.name}`);
      } else {
        showToast('error', (tripItemResponse as any).error || 'Failed to add item');
      }
    } catch (error) {
      showToast('error', 'Failed to add item');
      console.error('Error adding built-in item from Add mode:', error);
    }
  };

  // Handler for removing items from trip in Add mode
  const handleRemoveFromTrip = async (tripItemId: string) => {
    const item = items()?.find((i) => i.id === tripItemId);
    if (!item) return;

    // Optimistic delete
    deleteItemsFromStore([tripItemId]);

    try {
      const response = await api.delete(endpoints.tripItems(props.tripId), {
        body: JSON.stringify({ id: tripItemId }),
      });

      if (!response.success) {
        showToast('error', 'Failed to remove item');
        refetch(); // Revert on error
      }
    } catch (error) {
      showToast('error', 'Failed to remove item');
      refetch(); // Revert on error
    }
  };

  const packedCount = () => items()?.filter((i) => i.is_packed).length || 0;
  const skippedCount = () => items()?.filter((i) => i.is_skipped).length || 0;
  const totalCount = () => items()?.length || 0;
  const unpackedCount = () => totalCount() - packedCount() - skippedCount();
  const progress = () => getPackingProgress(packedCount(), totalCount() - skippedCount());

  // Get available containers for select mode
  const getContainers = () => {
    const currentItems = items() || [];
    return currentItems.filter((item) => item.is_container);
  };

  return (
    <div class="flex h-screen flex-col bg-gray-50">
      <Toast />

      <PackingPageHeader
        trip={trip}
        packedCount={packedCount}
        skippedCount={skippedCount}
        totalCount={totalCount}
        unpackedCount={unpackedCount}
        progress={progress}
        selectMode={selectMode}
        sortBy={sortBy}
        showUnpackedOnly={showUnpackedOnly}
        onToggleShowUnpackedOnly={() => setShowUnpackedOnly(!showUnpackedOnly())}
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
        onEditTrip={() => setShowEditTrip(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        visibleItemCount={visibleItemsCount}
        onScrollToItemRequest={(itemId) => setPendingScrollItemId(itemId)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(viewMode() === 'pack' ? 'add' : 'pack')}
      />

      {/* Main content - scrollable area */}
      <main class="flex-1 overflow-y-auto">
        {/* Add Mode View */}
        <Show when={viewMode() === 'add'}>
          <Show when={!itemsState.loading} fallback={<LoadingSpinner text="Loading..." />}>
            <AddModeView
              tripId={props.tripId}
              items={items}
              bags={bags}
              categories={categories}
              masterItems={masterItems}
              onAddMasterItem={handleAddMasterItemFromAddMode}
              onAddBuiltInItem={handleAddBuiltInItemFromAddMode}
              onRemoveFromTrip={handleRemoveFromTrip}
              onAddNewItem={() => setShowAddForm(true)}
              onManageBags={() => setShowBagManager(true)}
              onBagReplaced={() => {
                refetch();
                refetchBags();
              }}
            />
          </Show>
        </Show>

        {/* Pack Mode View */}
        <Show when={viewMode() === 'pack'}>
          <div class="container mx-auto px-4 py-6 pb-20 md:px-3 md:py-3 md:pb-16">
            <Show when={!itemsState.loading} fallback={<LoadingSpinner text="Loading items..." />}>
              <Show
                when={!itemsState.error}
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
                    when={!noSearchResults()}
                    fallback={
                      <div class="py-16 text-center text-gray-500">
                        No items match "{searchQuery().trim()}". Try adjusting your search.
                      </div>
                    }
                  >
                    <Show
                      when={sortBy() === 'bag'}
                      fallback={
                        <PackingListCategoryView
                          items={visibleItems}
                          bags={bags}
                          categories={categories}
                          selectMode={selectMode}
                          selectedItems={selectedItems}
                          showUnpackedOnly={showUnpackedOnly}
                          onTogglePacked={handleTogglePacked}
                          onToggleSkipped={handleToggleSkipped}
                          onEditItem={openEditItem}
                          onToggleItemSelection={toggleItemSelection}
                          onMoveItemToBag={handleMoveItemToBag}
                          onMoveItemToContainer={handleMoveItemToContainer}
                          onUpdateQuantity={handleUpdateQuantity}
                        />
                      }
                    >
                      <PackingListBagView
                        tripId={props.tripId}
                        items={visibleItems}
                        bags={bags}
                        categories={categories}
                        selectMode={selectMode}
                        selectedItems={selectedItems}
                        showUnpackedOnly={showUnpackedOnly}
                        onTogglePacked={handleTogglePacked}
                        onToggleSkipped={handleToggleSkipped}
                        onEditItem={openEditItem}
                        onToggleItemSelection={toggleItemSelection}
                        onUpdateQuantity={handleUpdateQuantity}
                        onAddToBag={(bagId) => openAddForm(bagId ?? undefined)}
                        onAddToContainer={(containerId) => openAddForm(undefined, containerId)}
                        onAddFromMasterToBag={(bagId) => openAddFromMaster(bagId ?? undefined)}
                        onAddFromMasterToContainer={(containerId) =>
                          openAddFromMaster(undefined, containerId)
                        }
                        onBrowseTemplatesToBag={(bagId) => openBrowseTemplates(bagId ?? undefined)}
                        onBrowseTemplatesToContainer={(containerId) =>
                          openBrowseTemplates(undefined, containerId)
                        }
                        onMoveItemToBag={handleMoveItemToBag}
                        onMoveItemToContainer={handleMoveItemToContainer}
                        onBagReplaced={() => {
                          refetch();
                          refetchBags();
                        }}
                        tripNotes={trip()?.notes || ''}
                        showNotesPanel={showNotesPanel}
                        onToggleNotesPanel={() => setShowNotesPanel(!showNotesPanel())}
                        onNotesChange={handleUpdateTripNotes}
                      />
                    </Show>
                  </Show>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </main>

      {/* Add Item Form Modal */}
      <Show when={showAddForm()}>
        <AddTripItemForm
          tripId={props.tripId}
          preSelectedBagId={preSelectedBagId()}
          preSelectedContainerId={preSelectedContainerId()}
          bags={bags()}
          onClose={closeAddForm}
          onSaved={(createdItem) => {
            if (createdItem) {
              addItemToStore(createdItem);
            } else {
              refetch();
            }
          }}
        />
      </Show>

      {/* Edit Item Modal */}
      <Show when={editingItem()}>
        <EditTripItem
          tripId={props.tripId}
          item={editingItem()!}
          allItems={items()}
          bags={bags()}
          onClose={() => {
            setEditingItem(null);
          }}
          onSaved={handleEditItemSaved}
          onDeleted={handleEditItemDeleted}
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
          bags={bags}
          tripItems={items}
          masterItems={masterItems}
          onClose={closeAddFromMaster}
          onAdded={() => refetch()}
          onItemAdded={(item) => addItemToStore(item)}
          onItemUpdated={(itemId, updates) => updateItemInStore(itemId, updates)}
          onItemRemoved={(itemId) => deleteItemsFromStore([itemId])}
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

      {/* Edit Trip Modal */}
      <Show when={showEditTrip() && trip()}>
        <TripForm
          trip={trip()!}
          onClose={() => setShowEditTrip(false)}
          onSaved={() => {
            setShowEditTrip(false);
            refetchTrip();
          }}
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
          onSkipAll={handleBatchSkip}
          onUnskipAll={handleBatchUnskip}
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
            <ChevronLeftIcon class="h-5 w-5" />
            Back
          </a>
        </div>
      </Show>
    </div>
  );
}
