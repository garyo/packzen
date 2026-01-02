import {
  createSignal,
  createResource,
  Show,
  onMount,
  createMemo,
  createEffect,
  onCleanup,
} from 'solid-js';
import { createStore, produce } from 'solid-js/store';
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
import { tripToYAML, downloadYAML } from '../../lib/yaml';
import { deleteTripWithConfirm } from '../../lib/trip-actions';
import { TripForm } from './TripForm';

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
    } catch (e) {
      setItemsState('error', e instanceof Error ? e.message : 'Failed to load items');
      setItemsState('loading', false);
    }
  };

  // Alias for compatibility with existing refetch() calls
  const refetch = fetchItems;

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

  const [masterItems] = createResource<MasterItemWithCategory[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItemWithCategory[]>(endpoints.masterItems),
      'Failed to load master items'
    );
  });

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
  });

  // Start in Add Mode if nothing is packed (first time load only)
  let hasSetInitialMode = false;
  createEffect(() => {
    const loadedItems = items();
    if (!hasSetInitialMode && loadedItems !== undefined) {
      hasSetInitialMode = true;
      const anyPacked = loadedItems.some((i) => i.is_packed);
      if (!anyPacked && loadedItems.length > 0) {
        setViewMode('add');
      }
    }
  });

  const handleTogglePacked = async (item: TripItem) => {
    // Optimistic update using store - fine-grained, no scroll disruption
    updateItemInStore(item.id, { is_packed: !item.is_packed });

    const response = await api.patch(endpoints.tripItems(props.tripId), {
      id: item.id,
      is_packed: !item.is_packed,
    });

    if (!response.success) {
      showToast('error', response.error || 'Failed to update item');
      // Revert on error
      updateItemInStore(item.id, { is_packed: item.is_packed });
    }
  };

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
      refetch(); // Revert on error
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
      refetch(); // Revert on error
    }
  };

  const handleBatchAssignToCategory = async (categoryId: string | null) => {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    const categoryName = categoryId
      ? categories()?.find((cat) => cat.id === categoryId)?.name || null
      : null;

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
      refetch(); // Revert on error
    }
  };

  const handleBatchDelete = async () => {
    const itemsToDelete = Array.from(selectedItems());
    if (itemsToDelete.length === 0) return;

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
      refetch(); // Revert on error
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

      showToast('success', `Unpacked ${packedItems.length} items`);
    } catch (error) {
      showToast('error', 'Failed to unpack items');
      refetch(); // Revert on error
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

  // Helper to get container name for display
  const getContainerName = (containerId: string | null) => {
    if (!containerId) return 'No Container';
    return items()?.find((i) => i.id === containerId)?.name || 'Unknown Container';
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
    item: { name: string; description: string | null; category: string; quantity: number },
    bagId: string | null,
    containerId: string | null
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

      const currentMasterItems = masterItemsResponse.data as any[];
      const existingCategories = categoriesResponse.data as any[];

      // Get or create category
      let category = existingCategories.find(
        (c: any) => c.name.toLowerCase() === item.category.toLowerCase()
      );

      if (!category) {
        const builtInCategory = builtInItems.categories.find(
          (c) => c.name.toLowerCase() === item.category.toLowerCase()
        );
        const response = await api.post(endpoints.categories, {
          name: item.category,
          icon: builtInCategory?.icon || null,
        });
        if (response.success && response.data) {
          category = response.data;
        }
      }

      // Get or create master item
      let masterItem = currentMasterItems.find(
        (m: any) => m.name.toLowerCase() === item.name.toLowerCase()
      );

      if (!masterItem) {
        const response = await api.post(endpoints.masterItems, {
          name: item.name,
          description: item.description,
          category_id: category?.id || null,
          default_quantity: item.quantity,
        });

        if (response.success && response.data) {
          masterItem = response.data;
        }
      }

      // Create trip item
      const tripItemResponse = await api.post(endpoints.tripItems(props.tripId), {
        name: item.name,
        category_name: item.category,
        quantity: item.quantity,
        notes: item.description,
        bag_id: containerId ? null : bagId,
        container_item_id: containerId,
        master_item_id: masterItem?.id || null,
      });

      if (tripItemResponse.success && tripItemResponse.data) {
        addItemToStore(tripItemResponse.data as TripItem);
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
  const totalCount = () => items()?.length || 0;
  const progress = () => getPackingProgress(packedCount(), totalCount());

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
                          onTogglePacked={handleTogglePacked}
                          onEditItem={openEditItem}
                          onToggleItemSelection={toggleItemSelection}
                          onMoveItemToBag={handleMoveItemToBag}
                          onMoveItemToContainer={handleMoveItemToContainer}
                        />
                      }
                    >
                      <PackingListBagView
                        items={visibleItems}
                        bags={bags}
                        categories={categories}
                        selectMode={selectMode}
                        selectedItems={selectedItems}
                        onTogglePacked={handleTogglePacked}
                        onEditItem={openEditItem}
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
                        onMoveItemToBag={handleMoveItemToBag}
                        onMoveItemToContainer={handleMoveItemToContainer}
                      />
                    </Show>
                  </Show>
                </Show>

                {/* Add Items Buttons - shown for both empty and non-empty states */}
                <div class="mt-6 flex flex-col items-center gap-3">
                  <Button onClick={() => setShowBagManager(true)}>Add Bags</Button>
                  <div class="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => openAddForm()}>Add Items</Button>
                    <Button variant="secondary" onClick={() => openAddFromMaster()}>
                      Add from My Items
                    </Button>
                    <Button variant="secondary" onClick={() => openBrowseTemplates()}>
                      Add from Templates
                    </Button>
                  </div>
                </div>
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
