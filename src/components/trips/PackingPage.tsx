import {
  createSignal,
  createResource,
  Show,
  For,
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
  BuiltInItem,
} from '../../lib/types';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Toast, showToast } from '../ui/Toast';
import { getPackingProgress, isSmallScreen } from '../../lib/utils';
import { BagManager } from './BagManager';
import { EditTripItem } from './EditTripItem';
import { AddTripItemForm } from './AddTripItemForm';
import { TripImportModal } from './TripImportModal';
import { PackingPageHeader } from './PackingPageHeader';
import { PackingListBagView } from './PackingListBagView';
import { PackingListCategoryView } from './PackingListCategoryView';
import { AddModeView } from './AddModeView';
import { SelectModeActionBar } from './SelectModeActionBar';
import {
  builtInItems,
  getStarterItems,
  getStarterQuantity,
  type StarterModifier,
} from '../../lib/built-in-items';
import { fetchWithErrorHandling, fetchSingleWithErrorHandling } from '../../lib/resource-helpers';
import { getOrCreateMasterItem, resolveMasterItems } from '../../lib/item-helpers';
import { syncManager, type SyncChange } from '../../lib/sync-manager';
import { LoadGate } from '../../lib/sync-buffer';
import { tripToYAML, downloadYAML } from '../../lib/yaml';
import { deleteTripWithConfirm } from '../../lib/trip-actions';
import { TripForm } from './TripForm';
import { ChevronLeftIcon } from '../ui/Icons';

interface PackingPageProps {
  tripId: string;
}

// api.* never throws - it resolves to { success: false, ... } on failure. This runs a
// batch of requests and reports back which ids failed, so callers can roll those back
// while keeping the successful ones applied.
async function runBatch<R extends { success: boolean }>(
  ids: string[],
  request: (id: string) => Promise<R>
): Promise<string[]> {
  const responses = await Promise.all(ids.map(request));
  return ids.filter((_, i) => !responses[i].success);
}

export function PackingPage(props: PackingPageProps) {
  const [showBagManager, setShowBagManager] = createSignal(false);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<TripItem | null>(null);
  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedItems, setSelectedItems] = createSignal<Set<string>>(new Set());
  const [showImport, setShowImport] = createSignal(false);
  const [showEditTrip, setShowEditTrip] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<'bag' | 'category'>('bag');
  const [viewMode, setViewMode] = createSignal<'pack' | 'add'>('pack');
  const [showUnpackedOnly, setShowUnpackedOnly] = createSignal(false);
  const [showNotesPanel, setShowNotesPanel] = createSignal(false);
  const [movingItem, setMovingItem] = createSignal<TripItem | null>(null);
  // The move-to-bag button is only useful when there's somewhere to move to.
  const hasMoveTargets = () =>
    (bags()?.length ?? 0) > 0 || (items() ?? []).some((i) => i.is_container);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = createSignal('');
  const [pendingScrollItemId, setPendingScrollItemId] = createSignal<string | null>(null);

  // One-tap starter list (shown in the empty state)
  const [starterDismissed, setStarterDismissed] = createSignal(false);
  const [addingStarter, setAddingStarter] = createSignal<string | null>(null);
  // Additive starter modifiers, chosen before tapping a trip type.
  const [starterIntl, setStarterIntl] = createSignal(false);
  const [starterFeminine, setStarterFeminine] = createSignal(false);
  const [starterMasculine, setStarterMasculine] = createSignal(false);
  const starterModifiers = (): StarterModifier[] => {
    const mods: StarterModifier[] = [];
    if (starterIntl()) mods.push('international');
    if (starterFeminine()) mods.push('feminine');
    if (starterMasculine()) mods.push('masculine');
    return mods;
  };
  // Which bag starter items go into when the trip has 2+ bags (the selector is
  // hidden otherwise). `undefined` = not chosen yet, so it falls back to the
  // first bag by sort_order; `null` = user explicitly picked "No bag".
  const [starterBagId, setStarterBagId] = createSignal<string | null | undefined>(undefined);

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

  // Guards the race between wholesale snapshot loads (below) and incremental
  // remote sync events (applied in onMount via applyTripItemChange, defined
  // after the store mutation helpers). A snapshot is a point-in-time read;
  // if a remote change lands while one is in flight, applying it immediately
  // and then letting the snapshot overwrite `data` would silently drop it -
  // permanently, since the sync poller's cursor has already moved past it.
  // See src/lib/sync-buffer.ts for the coordination logic itself.
  const loadGate = new LoadGate<SyncChange>();

  // Fetch items from server and populate store
  const fetchItems = async () => {
    setItemsState('loading', true);
    setItemsState('error', null);
    loadGate.startLoad();
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
    } finally {
      loadGate.endLoad(applyTripItemChange);
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

    loadGate.startLoad();
    try {
      const result = await api.get<TripItem[]>(endpoints.tripItems(props.tripId));
      if (result.success && result.data) {
        // Use reconcile for efficient diffing - only updates changed items
        setItemsState('data', reconcile(result.data));
      }
    } catch {
      // Silent failure - don't disrupt the user
    } finally {
      loadGate.endLoad(applyTripItemChange);
    }
  };

  // Refresh data when tab becomes visible (handles multi-device sync).
  // This reads no reactive signals, so it only ever needs to run once, at
  // mount — onMount is the correct primitive (a dependency-less createEffect
  // happens to run once too, but that's incidental, not its contract).
  onMount(() => {
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

  // Add item to store, or update in place if one with the same id is already
  // present. The items POST endpoint merges duplicates server-side (e.g. bumps
  // quantity on an existing row) and returns that existing item rather than a
  // new one, so callers can't assume the id is new.
  const addItemToStore = (item: TripItem) => {
    setItemsState(
      produce((state) => {
        const index = state.data.findIndex((i) => i.id === item.id);
        if (index === -1) {
          state.data.push(item);
        } else {
          state.data[index] = item;
        }
      })
    );
  };

  // Applies one remote `tripItem` sync change to the store. Pulled out of
  // the onMount subscription so it can also be used as the replay function
  // for events that loadGate queued during an in-flight snapshot load - each
  // branch is idempotent (upsert-by-id, delete-of-absent is a no-op, update-
  // of-absent is a no-op - see updateItemInStore), so replaying an event the
  // snapshot already reflects is harmless.
  const applyTripItemChange = (change: SyncChange) => {
    switch (change.action) {
      case 'create': {
        const exists = itemsState.data.some((i) => i.id === change.entityId);
        if (!exists) addItemToStore(change.data);
        break;
      }
      case 'update':
        updateItemInStore(change.entityId, change.data);
        break;
      case 'delete':
        deleteItemsFromStore([change.entityId]);
        break;
    }
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

  // Which bag starter items go into when the trip has 2+ bags. Declared after
  // `bags` so this eager memo never reads it in the temporal dead zone. A
  // sorted copy gives a stable "first bag" default; never mutate bags() itself.
  const sortedStarterBags = createMemo(() =>
    [...(bags() ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  );
  const selectedStarterBagId = () =>
    starterBagId() !== undefined ? starterBagId() : (sortedStarterBags()[0]?.id ?? null);

  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  // Modals that create categories/master items (Add Item, Edit Item) hold their own
  // in-flight copies and call this afterward so the newly created row flows back
  // down as a prop instead of each modal refetching its own redundant copy.
  const refetchCategoriesAndMasterItems = () => {
    refetchCategories();
    refetchMasterItems();
  };

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

  // Not dead: used below (search-result checks, header count, both list views).
  // It's aliased to `filteredItems` (rather than wrapped in a new closure) so
  // there's no pointless extra indirection.
  const visibleItems = filteredItems;
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

  onMount(() => {
    // Everything that registers an onCleanup must run synchronously, before
    // any `await` — an onCleanup called after the mount callback has resumed
    // from an await runs with no reactive owner and is silently dropped (it
    // would never fire syncManager.disconnect() or the unsubscribes below).
    //
    // Connecting here also closes the checkpoint race with the initial items
    // fetch: syncManager.connect() dispatches its checkpoint-establishing
    // request immediately, strictly before fetchItems() is called (which
    // only happens after the auth/init await further down). Any change
    // committed after that checkpoint is captured is guaranteed to show up
    // either in the initial fetch's snapshot or a subsequent poll — closing
    // the window where a change could land in neither.
    syncManager.connect();
    onCleanup(() => syncManager.disconnect());

    // Subscribe to trip item changes for this trip. While a snapshot load
    // (fetchItems/silentRefresh) is in flight, queue via loadGate instead of
    // applying directly - the in-flight snapshot was fetched before this
    // change and would otherwise clobber it when it lands.
    const unsubTripItem = syncManager.on('tripItem', (change) => {
      if (change.parentId !== props.tripId) return;
      loadGate.submit(change, applyTripItemChange);
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

    // Auth init and the initial items fetch have no bearing on the sync
    // wiring above — getSessionToken() awaits Clerk's own load state
    // independently of authStore — so they can run after, unawaited by
    // onMount itself.
    void (async () => {
      await authStore.initAuth();
      fetchItems();
    })();
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
      } else if (!isSmallScreen()) {
        // On phones this confirmation just obscures the screen when packing in
        // quick succession; the checkbox already reflects the change and tapping
        // it again is the natural undo, so skip the toast on small viewports.
        const actionText = newValue ? actionLabel : `un${actionLabel}`;
        showToast('info', `${item.name} ${actionText}`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              updateItemInStore(item.id, { [field]: originalValue });
              const undoResponse = await api.patch(endpoints.tripItems(props.tripId), {
                id: item.id,
                [field]: originalValue,
              });
              if (!undoResponse.success) {
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
    if (movedItemIds && movedItemIds.length > 0) {
      // "Keep Items": children were reparented out of the container first.
      const deletedItem = items()?.find((i) => i.id === deletedItemId);
      const inheritedBagId = deletedItem?.bag_id || null;
      updateItemsInStore(movedItemIds, {
        container_item_id: null,
        bag_id: inheritedBagId,
      });
      deleteItemsFromStore([deletedItemId]);
    } else {
      // "Delete All" (or plain delete): the server cascade-deleted any children
      // of this container, so remove them from the store along with the item.
      const childIds = (items() ?? [])
        .filter((i) => i.container_item_id === deletedItemId)
        .map((i) => i.id);
      deleteItemsFromStore([deletedItemId, ...childIds]);
    }
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

  const closeAddForm = () => closeModalWithPreSelection(setShowAddForm);

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

    const failedIds = await runBatch(itemsToUpdate, (itemId) =>
      api.patch(endpoints.tripItems(props.tripId), {
        id: itemId,
        bag_id: bagId,
        container_item_id: null, // Clear container when assigning to bag
      })
    );

    if (failedIds.length > 0) {
      failedIds.forEach((id) => updateItemInStore(id, previousStates.get(id)!));
      const succeeded = itemsToUpdate.length - failedIds.length;
      showToast(
        'error',
        succeeded > 0
          ? `Assigned ${succeeded} of ${itemsToUpdate.length} items to bag; ${failedIds.length} failed`
          : `Failed to assign ${failedIds.length} items to bag`
      );
    } else {
      showToast('success', `Assigned ${itemsToUpdate.length} items to bag`);
    }
    setSelectMode(false);
    setSelectedItems(new Set<string>());
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

    const failedIds = await runBatch(itemsToUpdate, (itemId) =>
      api.patch(endpoints.tripItems(props.tripId), {
        id: itemId,
        container_item_id: containerId,
        bag_id: null, // Clear bag when assigning to container
      })
    );

    const containerName = containerId
      ? currentItems.find((item) => item.id === containerId)?.name || 'container'
      : 'no container';

    if (failedIds.length > 0) {
      failedIds.forEach((id) => updateItemInStore(id, previousStates.get(id)!));
      const succeeded = itemsToUpdate.length - failedIds.length;
      showToast(
        'error',
        succeeded > 0
          ? `Assigned ${succeeded} of ${itemsToUpdate.length} items to ${containerName}; ${failedIds.length} failed`
          : `Failed to assign ${failedIds.length} items to ${containerName}`
      );
    } else {
      showToast('success', `Assigned ${itemsToUpdate.length} items to ${containerName}`);
    }
    setSelectMode(false);
    setSelectedItems(new Set<string>());
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

    const failedIds = await runBatch(itemsToUpdate, (itemId) =>
      api.patch(endpoints.tripItems(props.tripId), {
        id: itemId,
        category_name: categoryName,
      })
    );

    const categoryLabel = categoryName || 'no category';

    if (failedIds.length > 0) {
      failedIds.forEach((id) =>
        updateItemInStore(id, { category_name: previousCategories.get(id) ?? null })
      );
      const succeeded = itemsToUpdate.length - failedIds.length;
      showToast(
        'error',
        succeeded > 0
          ? `Assigned ${succeeded} of ${itemsToUpdate.length} items to ${categoryLabel}; ${failedIds.length} failed`
          : `Failed to assign ${failedIds.length} items to ${categoryLabel}`
      );
    } else {
      showToast('success', `Assigned ${itemsToUpdate.length} items to ${categoryLabel}`);
    }
    setSelectMode(false);
    setSelectedItems(new Set<string>());
  };

  async function handleBatchSetSkipped(skip: boolean) {
    const itemsToUpdate = Array.from(selectedItems());
    if (itemsToUpdate.length === 0) return;

    updateItemsInStore(itemsToUpdate, { is_skipped: skip });

    const failedIds = await runBatch(itemsToUpdate, (itemId) =>
      api.patch(endpoints.tripItems(props.tripId), {
        id: itemId,
        is_skipped: skip,
      })
    );

    const label = skip ? 'Skipped' : 'Unskipped';

    if (failedIds.length > 0) {
      updateItemsInStore(failedIds, { is_skipped: !skip });
      const succeeded = itemsToUpdate.length - failedIds.length;
      showToast(
        'error',
        succeeded > 0
          ? `${label} ${succeeded} of ${itemsToUpdate.length} items; ${failedIds.length} failed`
          : `Failed to ${skip ? 'skip' : 'unskip'} ${failedIds.length} items`
      );
    } else {
      showToast('success', `${label} ${itemsToUpdate.length} items`);
    }
    setSelectMode(false);
    setSelectedItems(new Set<string>());
  }

  const handleBatchSkip = () => handleBatchSetSkipped(true);
  const handleBatchUnskip = () => handleBatchSetSkipped(false);

  const handleBatchDelete = async () => {
    const itemsToDelete = Array.from(selectedItems());
    if (itemsToDelete.length === 0) return;

    // Capture deleted items for rollback
    const deletedItems = items()?.filter((item) => selectedItems().has(item.id)) || [];
    const deletedItemsById = new Map(deletedItems.map((item) => [item.id, item]));

    // Optimistic delete using store - no scroll disruption
    deleteItemsFromStore(itemsToDelete);

    const failedIds = await runBatch(itemsToDelete, (itemId) =>
      api.delete(endpoints.tripItems(props.tripId), {
        body: JSON.stringify({ id: itemId }),
      })
    );

    if (failedIds.length > 0) {
      failedIds.forEach((id) => {
        const item = deletedItemsById.get(id);
        if (item) addItemToStore(item);
      });
      const succeeded = itemsToDelete.length - failedIds.length;
      showToast(
        'error',
        succeeded > 0
          ? `Deleted ${succeeded} of ${itemsToDelete.length} items; ${failedIds.length} failed`
          : `Failed to delete ${failedIds.length} items`
      );
    } else {
      showToast('success', `Deleted ${itemsToDelete.length} items`);
    }
    setSelectMode(false);
    setSelectedItems(new Set<string>());
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

  const [showClearAllConfirm, setShowClearAllConfirm] = createSignal(false);

  const handleClearAll = () => {
    const packedItems = (items() || []).filter((item) => item.is_packed);
    if (packedItems.length === 0) {
      showToast('error', 'No packed items to clear');
      return;
    }
    setShowClearAllConfirm(true);
  };

  const performClearAll = async () => {
    setShowClearAllConfirm(false);

    const currentItems = items() || [];
    const packedItems = currentItems.filter((item) => item.is_packed);

    if (packedItems.length === 0) {
      showToast('error', 'No packed items to clear');
      return;
    }

    const packedItemIds = packedItems.map((item) => item.id);

    // Optimistic update using store
    updateItemsInStore(packedItemIds, { is_packed: false });

    const failedIds = await runBatch(packedItemIds, (itemId) =>
      api.patch(endpoints.tripItems(props.tripId), {
        id: itemId,
        is_packed: false,
      })
    );

    if (failedIds.length > 0) {
      updateItemsInStore(failedIds, { is_packed: true });
    }

    const succeededIds = packedItemIds.filter((id) => !failedIds.includes(id));

    if (succeededIds.length === 0) {
      showToast('error', `Failed to unpack ${failedIds.length} items`);
      return;
    }

    const message =
      failedIds.length > 0
        ? `Unpacked ${succeededIds.length} of ${packedItemIds.length} items; ${failedIds.length} failed`
        : `Unpacked ${succeededIds.length} items`;

    showToast('info', message, {
      action: {
        label: 'Undo',
        onClick: async () => {
          updateItemsInStore(succeededIds, { is_packed: true });
          const undoFailedIds = await runBatch(succeededIds, (itemId) =>
            api.patch(endpoints.tripItems(props.tripId), {
              id: itemId,
              is_packed: true,
            })
          );
          if (undoFailedIds.length > 0) {
            showToast('error', 'Failed to undo');
            updateItemsInStore(undoFailedIds, { is_packed: false });
          }
        },
      },
    });
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
    masterItemsList: MasterItemWithCategory[];
    categoriesList: Category[];
  }> {
    let masterItemsList: MasterItemWithCategory[] = masterItems() ? [...masterItems()!] : [];
    let categoriesList: Category[] = categories() ? [...categories()!] : [];

    if (!masterItemsList.length || !categoriesList.length) {
      const [masterItemsResponse, categoriesResponse] = await Promise.all([
        masterItemsList.length
          ? Promise.resolve({ success: true, data: masterItemsList })
          : api.get<MasterItemWithCategory[]>(endpoints.masterItems),
        categoriesList.length
          ? Promise.resolve({ success: true, data: categoriesList })
          : api.get<Category[]>(endpoints.categories),
      ]);

      if (!masterItemsResponse.success || !categoriesResponse.success) {
        throw new Error('Failed to fetch master items or categories');
      }

      masterItemsList = masterItemsResponse.data as MasterItemWithCategory[];
      categoriesList = categoriesResponse.data as Category[];
    }

    return { masterItemsList, categoriesList };
  }

  const [addingBuiltIn, setAddingBuiltIn] = createSignal(false);

  const handleAddBuiltInItemsToTrip = async (
    itemsToAdd: SelectedBuiltInItem[],
    bagId?: string | null,
    containerId?: string | null
  ) => {
    if (addingBuiltIn()) return;
    setAddingBuiltIn(true);
    try {
      const { masterItemsList, categoriesList } = await ensureResourcesLoaded();

      // Resolve every item's master item concurrently (categories needed for
      // new master items are pre-created first, so items sharing a brand-new
      // category don't race to create duplicate rows for it), then add all
      // trip items in a single batch request — replacing what used to be up
      // to 3 serial round trips per item.
      const masterItemResults = await resolveMasterItems(
        itemsToAdd,
        masterItemsList,
        categoriesList
      );
      refetchMasterItems();

      const payload = itemsToAdd.map((item, i) => ({
        name: item.name,
        category_name: item.category,
        quantity: item.quantity,
        notes: item.description,
        bag_id: containerId ? null : bagId || null,
        container_item_id: containerId || null,
        master_item_id: masterItemResults[i].item?.id ?? null,
        is_container: item.is_container || false,
      }));

      const response = await api.post<TripItem[]>(endpoints.tripItems(props.tripId), {
        items: payload,
      });

      if (response.success && response.data) {
        response.data.forEach((item) => addItemToStore(item));
        const addedCount = response.data.length;
        if (addedCount === itemsToAdd.length) {
          showToast('success', `Added ${addedCount} items to trip and My Items`);
        } else {
          // The batch endpoint dedups by name against items already in the
          // trip (and within the batch itself) rather than merging/bumping
          // quantity the way the single-item route does — same tradeoff
          // handleAddStarterList already makes, for the same perf win.
          showToast(
            'info',
            `Added ${addedCount} of ${itemsToAdd.length} items (${itemsToAdd.length - addedCount} already in trip or over the plan limit)`
          );
        }
      } else {
        showToast('error', (response as { error?: string }).error || 'Failed to add items');
      }
    } catch (error) {
      showToast('error', 'Failed to add items');
      console.error('Error adding built-in items to trip:', error);
    } finally {
      setAddingBuiltIn(false);
    }
  };

  // One-tap starter list: add a whole trip type's built-in items in one batch.
  // Items are assigned to a bag (see targetBagId below) and deduped by name against
  // what's already on the trip, so tapping several chips (or the same chip twice)
  // never duplicates.
  const handleAddStarterList = async (tripTypeId: string, modifiers: StarterModifier[] = []) => {
    if (addingStarter()) return;

    const existingNames = new Set((items() ?? []).map((i) => i.name.toLowerCase()));
    const starter = getStarterItems(tripTypeId, modifiers).filter(
      (item) => !existingNames.has(item.name.toLowerCase())
    );

    if (starter.length === 0) {
      showToast('info', 'Those items are already on your list');
      return;
    }

    // Group toiletries into a "Toilet Kit" container so the starter list arrives
    // organized.
    const TOILETRY_CATEGORY = 'Toiletries';
    const isToiletry = (item: BuiltInItem) =>
      item.category === TOILETRY_CATEGORY && !item.is_container;
    const hasToiletries = starter.some(isToiletry);

    // Auto-assign into the user's bag when there's exactly one — otherwise the
    // wizard's "create bags" step is immediately undone by dumping everything in
    // "No Bag". Zero bags: nothing to assign into. 2+ bags: use the inline
    // selector's choice (defaults to the first bag by sort_order).
    const currentBags = bags() || [];
    const targetBagId =
      currentBags.length === 0
        ? null
        : currentBags.length === 1
          ? currentBags[0].id
          : selectedStarterBagId();

    setAddingStarter(tripTypeId);
    try {
      // Create the container first so its generated id can nest the toiletries.
      // Reuse an existing "Toilet Kit" instead of creating a second one — a repeat
      // tap (e.g. another chip that also has toiletries) would otherwise merge into
      // a duplicate container, bumping its quantity to "2x Toilet Kit".
      let toiletKitId: string | null = null;
      let createdToiletKit: TripItem | null = null;
      if (hasToiletries) {
        const existingToiletKit = (items() ?? []).find(
          (i) => i.is_container && i.name.toLowerCase() === 'toilet kit'
        );
        if (existingToiletKit) {
          toiletKitId = existingToiletKit.id;
        } else {
          const containerRes = await api.post<TripItem>(endpoints.tripItems(props.tripId), {
            name: 'Toilet Kit',
            category_name: TOILETRY_CATEGORY,
            is_container: true,
            bag_id: targetBagId,
          });
          if (containerRes.success && containerRes.data) {
            toiletKitId = containerRes.data.id;
            createdToiletKit = containerRes.data;
          }
        }
      }

      const payload = starter.map((item) => ({
        name: item.name,
        category_name: item.category,
        quantity: getStarterQuantity(item, tripTypeId),
        notes: item.description,
        is_container: item.is_container || false,
        // Nested items follow their container's bag, not their own bag_id
        // (PackingListBagView/PackingListCategoryView group by container_item_id
        // and ignore bag_id on nested children) — null it for consistency with
        // handleAddMasterItemFromAddMode/handleAddBuiltInItemFromAddMode.
        bag_id: toiletKitId && isToiletry(item) ? null : targetBagId,
        container_item_id: toiletKitId && isToiletry(item) ? toiletKitId : null,
        master_item_id: null,
      }));

      const response = await api.post<TripItem[]>(endpoints.tripItems(props.tripId), {
        items: payload,
      });

      if (response.success && response.data) {
        if (createdToiletKit) addItemToStore(createdToiletKit);
        response.data.forEach((item) => addItemToStore(item));
        const total = response.data.length + (createdToiletKit ? 1 : 0);
        showToast('success', `Added ${total} items`);
      } else {
        // The items that were meant to go in it never made it — don't leave a
        // newly-created container orphaned and empty.
        if (createdToiletKit) {
          await api.delete(endpoints.tripItems(props.tripId), {
            body: JSON.stringify({ id: createdToiletKit.id }),
          });
        }
        showToast('error', (response as { error?: string }).error || 'Failed to add items');
      }
    } catch {
      showToast('error', 'Failed to add items');
    } finally {
      setAddingStarter(null);
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
      const { item: masterItem } = await getOrCreateMasterItem(
        item,
        masterItemsList,
        categoriesList
      );

      const tripItemResponse = await api.post(endpoints.tripItems(props.tripId), {
        name: item.name,
        category_name: item.category,
        quantity: item.quantity,
        notes: item.description,
        bag_id: containerId ? null : bagId,
        container_item_id: containerId,
        master_item_id: masterItem?.id ?? null,
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

  // Header counts must reflect only items that are actually rendered somewhere.
  // An item is renderable unless it's a container-orphan: it points at a
  // container_item_id that no longer exists (or no longer is a container).
  // Such orphans are hidden by both list views, so counting them would show a
  // phantom "N unpacked" with nothing to pack. Items with a dangling bag_id are
  // still rendered (Category view), so they stay counted.
  const renderableItems = createMemo(() => {
    const all = items() ?? [];
    const containerIds = new Set(all.filter((i) => i.is_container).map((i) => i.id));
    return all.filter((i) => !i.container_item_id || containerIds.has(i.container_item_id));
  });

  const packedCount = () => renderableItems().filter((i) => i.is_packed).length;
  const skippedCount = () => renderableItems().filter((i) => i.is_skipped).length;
  const totalCount = () => renderableItems().length;
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
              onAddBuiltInItems={handleAddBuiltInItemsToTrip}
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
          <div class="container mx-auto px-2 py-6 pb-20 md:px-3 md:py-3 md:pb-16">
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
                    <Show
                      when={!starterDismissed()}
                      fallback={
                        <EmptyState
                          icon="📦"
                          title="No items yet"
                          description="Tap Add above to build your packing list."
                        />
                      }
                    >
                      <div class="mx-auto max-w-2xl px-4 py-10 text-center">
                        <div class="mb-3 text-5xl">🧳</div>
                        <h3 class="mb-1 text-xl font-semibold text-gray-900">
                          Start your packing list
                        </h3>
                        <p class="mb-5 text-gray-600">
                          Add a ready-made set of essentials in one tap.
                        </p>

                        {/* Optional add-ons in their own labeled card, so they read as
                            settings for your pick — not as part of the main choice. */}
                        <div class="mx-auto mb-6 max-w-md rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
                          <p class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            Options (applied to your pick)
                          </p>
                          <div class="flex flex-col gap-3">
                            <div class="flex items-center gap-3">
                              <span class="w-24 shrink-0 text-sm text-gray-500">Trip style:</span>
                              <button
                                type="button"
                                onClick={() => setStarterIntl((v) => !v)}
                                aria-pressed={starterIntl()}
                                class="rounded-full border px-3 py-1 text-sm transition-colors"
                                classList={{
                                  'border-blue-500 bg-blue-50 text-blue-700': starterIntl(),
                                  'border-gray-200 bg-white text-gray-600 hover:border-blue-400':
                                    !starterIntl(),
                                }}
                              >
                                🌍 International
                              </button>
                            </div>
                            <div class="flex items-center gap-3">
                              <span class="w-24 shrink-0 text-sm text-gray-500">Add clothing:</span>
                              <div class="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStarterFeminine((v) => !v)}
                                  aria-pressed={starterFeminine()}
                                  class="rounded-full border px-3 py-1 text-sm transition-colors"
                                  classList={{
                                    'border-blue-500 bg-blue-50 text-blue-700': starterFeminine(),
                                    'border-gray-200 bg-white text-gray-600 hover:border-blue-400':
                                      !starterFeminine(),
                                  }}
                                >
                                  Feminine
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStarterMasculine((v) => !v)}
                                  aria-pressed={starterMasculine()}
                                  class="rounded-full border px-3 py-1 text-sm transition-colors"
                                  classList={{
                                    'border-blue-500 bg-blue-50 text-blue-700': starterMasculine(),
                                    'border-gray-200 bg-white text-gray-600 hover:border-blue-400':
                                      !starterMasculine(),
                                  }}
                                >
                                  Masculine
                                </button>
                              </div>
                            </div>
                            {/* Show which bag the essentials will go into — a selector when
                                there's a choice, otherwise the single bag's name as confirmation. */}
                            <Show when={(bags()?.length ?? 0) >= 1}>
                              <div class="flex items-center gap-3">
                                <span class="w-24 shrink-0 text-sm text-gray-500">Add to bag:</span>
                                <Show
                                  when={(bags()?.length ?? 0) >= 2}
                                  fallback={
                                    <span class="text-sm font-medium text-gray-900">
                                      {sortedStarterBags()[0]?.name}
                                    </span>
                                  }
                                >
                                  <select
                                    id="starter-bag-select"
                                    value={selectedStarterBagId() ?? ''}
                                    onChange={(e) => setStarterBagId(e.currentTarget.value || null)}
                                    class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  >
                                    <For each={sortedStarterBags()}>
                                      {(bag) => <option value={bag.id}>{bag.name}</option>}
                                    </For>
                                    <option value="">No bag</option>
                                  </select>
                                </Show>
                              </div>
                            </Show>
                          </div>
                        </div>

                        <p class="mb-3 text-sm font-medium text-gray-700">Pick a trip type:</p>
                        <div class="flex flex-wrap justify-center gap-2 sm:gap-3">
                          <For
                            each={builtInItems.trip_types.filter((t) => t.id !== 'international')}
                          >
                            {(tripType) => (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddStarterList(tripType.id, starterModifiers())
                                }
                                disabled={addingStarter() !== null}
                                aria-busy={addingStarter() === tripType.id}
                                class="flex min-w-[7rem] flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span class="font-medium text-gray-900">{tripType.name}</span>
                                <span class="mt-0.5 text-xs text-gray-500">
                                  {tripType.description}
                                </span>
                              </button>
                            )}
                          </For>
                        </div>
                        <button
                          type="button"
                          onClick={() => setStarterDismissed(true)}
                          class="mt-6 text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                        >
                          I’ll add my own
                        </button>
                      </div>
                    </Show>
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
                          onRequestMoveItem={hasMoveTargets() ? setMovingItem : undefined}
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
                        onMoveItemToBag={handleMoveItemToBag}
                        onRequestMoveItem={hasMoveTargets() ? setMovingItem : undefined}
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
          categories={categories()}
          tripItems={items()}
          masterItems={masterItems()}
          onDataChanged={refetchCategoriesAndMasterItems}
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
      <Show when={movingItem()}>
        <Modal title="Move item" size="small" onClose={() => setMovingItem(null)}>
          <div class="space-y-2">
            <For each={bags() || []}>
              {(bag) => (
                <button
                  onClick={() => {
                    handleMoveItemToBag(movingItem()!.id, bag.id);
                    setMovingItem(null);
                  }}
                  class="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
                  classList={{ 'border-blue-400 bg-blue-50': movingItem()?.bag_id === bag.id }}
                >
                  <span class="text-lg">👜</span>
                  <span class="min-w-0 flex-1 truncate font-medium text-gray-900">{bag.name}</span>
                  <Show when={movingItem()?.bag_id === bag.id}>
                    <span class="text-xs text-blue-600">current</span>
                  </Show>
                </button>
              )}
            </For>
            {/* Containers as destinations (a container can't be nested in another) */}
            <Show when={!movingItem()?.is_container}>
              <For
                each={(items() ?? []).filter((i) => i.is_container && i.id !== movingItem()?.id)}
              >
                {(container) => (
                  <button
                    onClick={() => {
                      handleMoveItemToContainer(movingItem()!.id, container.id);
                      setMovingItem(null);
                    }}
                    class="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
                    classList={{
                      'border-blue-400 bg-blue-50':
                        movingItem()?.container_item_id === container.id,
                    }}
                  >
                    <span class="text-lg">📦</span>
                    <span class="min-w-0 flex-1 truncate font-medium text-gray-900">
                      {container.name}
                    </span>
                    <Show when={movingItem()?.container_item_id === container.id}>
                      <span class="text-xs text-blue-600">current</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
            <button
              onClick={() => {
                handleMoveItemToBag(movingItem()!.id, null);
                setMovingItem(null);
              }}
              class="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
              classList={{
                'border-blue-400 bg-blue-50':
                  !movingItem()?.bag_id && !movingItem()?.container_item_id,
              }}
            >
              <span class="text-lg">🧺</span>
              <span class="min-w-0 flex-1 font-medium text-gray-900">
                No bag (wearing / carry-on)
              </span>
            </button>
          </div>
        </Modal>
      </Show>

      {/* Clear All confirmation dialog */}
      <Show when={showClearAllConfirm()}>
        <div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 class="mb-4 text-lg font-semibold text-gray-900">Unpack All Items?</h3>
            <p class="mb-6 text-sm text-gray-600">
              This will mark all packed items as unpacked. You can undo this afterward.
            </p>
            <div class="flex gap-3">
              <Button onClick={performClearAll} variant="secondary" class="flex-1 justify-center">
                Unpack All
              </Button>
              <Button
                onClick={() => setShowClearAllConfirm(false)}
                variant="secondary"
                class="flex-1 justify-center"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={editingItem()}>
        <EditTripItem
          tripId={props.tripId}
          item={editingItem()!}
          allItems={items()}
          bags={bags()}
          categories={categories()}
          onDataChanged={refetchCategories}
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
        <div class="fixed bottom-4 left-4 hidden md:block [@media(max-height:500px)]:hidden">
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
