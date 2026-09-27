import { createSignal, createResource, createEffect, Show, onMount, onCleanup } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripItem, Bag, Category, MasterItemWithCategory } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Toast, showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { isSmallScreen } from '../../lib/utils';
import { BagManager } from './BagManager';
import { EditTripItem } from './EditTripItem';
import { AddTripItemForm } from './AddTripItemForm';
import { TripImportModal } from './TripImportModal';
import { ReplaceBagModal } from './ReplaceBagModal';
import { TripForm } from './TripForm';
import { PackingPageHeader, type ViewMode } from './PackingPageHeader';
import { PackingListBagView } from './PackingListBagView';
import { PackingListCategoryView } from './PackingListCategoryView';
import type { PackingListProps } from './PackingListParts';
import { AddModeView } from './AddModeView';
import { SelectModeActionBar } from './SelectModeActionBar';
import { StarterListPanel } from './StarterListPanel';
import { ItemActionSheet } from './ItemActionSheet';
import { TripNotesPanel } from './TripNotesPanel';
import { useItemSearch } from './useItemSearch';
import { fetchWithFallback } from '../../lib/resource-helpers';
import { createTripItemsStore } from '../../lib/trip-items-store';
import { createTripItemAdder, itemCount } from '../../lib/trip-item-adder';
import { byName } from '../../lib/item-placement';
import { syncManager } from '../../lib/sync-manager';
import { tripToYAML, downloadYAML } from '../../lib/yaml';
import { deleteTripWithConfirm } from '../../lib/trip-actions';

interface PackingPageProps {
  tripId: string;
}

/**
 * A trip started with one tap on My Trips opens with ?starter=<trip type>.
 * Read it once and drop it from the URL, so a reload doesn't re-apply it.
 */
function takeStarterParam(): string | null {
  const url = new URL(window.location.href);
  const tripTypeId = url.searchParams.get('starter');
  if (tripTypeId) {
    url.searchParams.delete('starter');
    window.history.replaceState(null, '', url);
  }
  return tripTypeId;
}

export function PackingPage(props: PackingPageProps) {
  const store = createTripItemsStore(props.tripId);
  const items = store.items;

  const [showBagManager, setShowBagManager] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<TripItem | null>(null);
  const [actionItem, setActionItem] = createSignal<TripItem | null>(null);
  const [replacingBag, setReplacingBag] = createSignal<Bag | null>(null);
  const [showImport, setShowImport] = createSignal(false);
  const [showEditTrip, setShowEditTrip] = createSignal(false);
  const [showNotesPanel, setShowNotesPanel] = createSignal(false);
  // Where the Add Item form puts its item, and any name to start with; null while closed.
  const [addFormTarget, setAddFormTarget] = createSignal<{
    bagId: string | null;
    containerId: string | null;
    name?: string;
  } | null>(null);
  const openAddForm = (
    bagId: string | null = null,
    containerId: string | null = null,
    name?: string
  ) => setAddFormTarget({ bagId, containerId, name });

  const [selectMode, setSelectMode] = createSignal(false);
  const [selectedItems, setSelectedItems] = createSignal<Set<string>>(new Set());
  const [sortBy, setSortBy] = createSignal<'bag' | 'category'>('bag');
  const [viewMode, setViewMode] = createSignal<ViewMode>('pack');
  const [showUnpackedOnly, setShowUnpackedOnly] = createSignal(false);

  // A failed load toasts and falls back, so the page still renders.
  const [trip, { refetch: refetchTrip }] = createResource(() =>
    fetchWithFallback(
      () => api.get<Trip>(endpoints.trip(props.tripId)),
      null,
      'Failed to load trip'
    )
  );
  const [bags, { refetch: refetchBags }] = createResource(() =>
    fetchWithFallback(
      () => api.get<Bag[]>(endpoints.tripBags(props.tripId)),
      [],
      'Failed to load bags'
    )
  );
  const [categories, { refetch: refetchCategories, mutate: setCategories }] = createResource(() =>
    fetchWithFallback(
      () => api.get<Category[]>(endpoints.categories),
      [],
      'Failed to load categories'
    )
  );
  const [masterItems, { refetch: refetchMasterItems, mutate: setMasterItems }] = createResource(
    () =>
      fetchWithFallback(
        () => api.get<MasterItemWithCategory[]>(endpoints.masterItems),
        [],
        'Failed to load My Items'
      )
  );

  const search = useItemSearch(items, bags);

  const retryLoad = () => {
    void store.load();
    refetchTrip();
    refetchBags();
    refetchCategories();
    refetchMasterItems();
  };

  const reloadItemsAndBags = () => {
    void store.refresh(true);
    refetchBags();
  };

  onMount(() => {
    onCleanup(
      syncManager.on('bag', (change) => {
        if (change.parentId !== props.tripId) return;
        refetchBags();
        // Deleting a bag clears bag_id on its items server-side, with no per-item events.
        if (change.action === 'delete') void store.refresh(true);
      })
    );
    onCleanup(
      syncManager.on('trip', (change) => {
        if (change.entityId === props.tripId) refetchTrip();
      })
    );
  });

  const containers = () => (items() ?? []).filter((item) => item.is_container);
  const bagName = (bagId: string | null) =>
    bags()?.find((bag) => bag.id === bagId)?.name ?? NO_BAG_LABEL;
  // The bag new items go in by default: the first one, as the lists show them.
  const firstBagId = () => [...(bags() ?? [])].sort(byName)[0]?.id ?? null;

  // --- Packing ---

  // On phones the checkbox is feedback enough; a toast would cover the list.
  const togglePacked = (item: TripItem) =>
    store.patchItems(
      [item.id],
      { is_packed: !item.is_packed },
      { label: `${item.name} ${item.is_packed ? 'unpacked' : 'packed'}`, quiet: isSmallScreen() }
    );

  const toggleSkipped = (item: TripItem) =>
    store.patchItems(
      [item.id],
      { is_skipped: !item.is_skipped },
      { label: `${item.name} ${item.is_skipped ? 'unskipped' : 'skipped'}`, quiet: isSmallScreen() }
    );

  const moveItemToBag = (itemId: string, bagId: string | null) => {
    const item = store.find(itemId);
    if (!item || (item.bag_id === bagId && !item.container_item_id)) return;
    void store.patchItems(
      [itemId],
      { bag_id: bagId, container_item_id: null },
      { label: `Moved "${item.name}" to ${bagName(bagId)}` }
    );
  };

  const moveItemToContainer = (itemId: string, containerId: string) => {
    const item = store.find(itemId);
    const container = store.find(containerId);
    if (!item || !container || item.container_item_id === containerId) return;
    if (item.is_container) {
      showToast('error', "Containers can't go inside other containers");
      return;
    }
    void store.patchItems(
      [itemId],
      { container_item_id: containerId, bag_id: null },
      { label: `Moved "${item.name}" to ${container.name}` }
    );
  };

  const handleClearAll = async () => {
    const packedIds = () => (items() ?? []).filter((item) => item.is_packed).map((item) => item.id);
    if (packedIds().length === 0) {
      showToast('info', 'Nothing is packed yet');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Unpack all items?',
      message: 'This marks every packed item as unpacked. You can undo this afterward.',
      confirmLabel: 'Unpack all',
    });
    if (confirmed) {
      void store.patchItems(
        packedIds(),
        { is_packed: false },
        { label: (n) => `Unpacked ${itemCount(n)}` }
      );
    }
  };

  // --- Select mode ---

  const toggleSelectMode = () => {
    setSelectMode(!selectMode());
    setSelectedItems(new Set<string>());
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  /** End select mode, returning what was selected. */
  const takeSelection = () => {
    const ids = [...selectedItems()];
    setSelectMode(false);
    setSelectedItems(new Set<string>());
    return ids;
  };

  const patchSelection = (patch: Partial<TripItem>, label: (count: number) => string) =>
    void store.patchItems(takeSelection(), patch, { label });

  const assignSelectionToContainer = (containerId: string | null) => {
    if (containerId && [...selectedItems()].some((id) => store.find(id)?.is_container)) {
      showToast('error', 'Containers cannot be placed inside other containers');
      return;
    }
    const name = containerId ? (store.find(containerId)?.name ?? 'container') : NO_BAG_LABEL;
    patchSelection(
      { container_item_id: containerId, bag_id: null },
      (n) => `Moved ${itemCount(n)} to ${name}`
    );
  };

  const assignSelectionToCategory = (categoryId: string | null) => {
    const name = categoryId ? (categories()?.find((c) => c.id === categoryId)?.name ?? null) : null;
    patchSelection(
      { category_name: name },
      (n) => `Assigned ${itemCount(n)} to ${name ?? 'Uncategorized'}`
    );
  };

  // --- Adding and removing items ---

  const adder = createTripItemAdder(store, {
    categories: { get: categories, set: setCategories },
    masterItems: { get: masterItems, set: setMasterItems },
  });

  const removeFromTrip = async (itemId: string) => {
    const item = store.find(itemId);
    if (!item) return;
    const contents = (items() ?? []).filter((i) => i.container_item_id === itemId).length;
    if (contents > 0) {
      const confirmed = await confirmDialog({
        title: `Remove ${item.name}?`,
        message: `The ${itemCount(contents)} inside it will be removed too.`,
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (!confirmed) return;
    }
    void store.deleteItems([itemId], { label: `Removed ${item.name}` });
  };

  // --- Modals and menu actions ---

  const handleEditItemSaved = (updatedItem?: TripItem) => {
    if (updatedItem) store.local.update([updatedItem.id], updatedItem);
    else void store.refresh(true);
    refetchBags();
  };

  // "Keep items": the contents were moved out of the container before it was deleted.
  const handleContainerDeleted = (deletedItemId: string, movedItemIds: string[]) => {
    store.local.update(movedItemIds, {
      container_item_id: null,
      bag_id: store.find(deletedItemId)?.bag_id ?? null,
    });
    store.local.remove([deletedItemId]);
  };

  const deleteItem = (item: TripItem) =>
    void store.deleteItems([item.id], { label: `Deleted ${item.name}` });

  // A one-tap trip from My Trips arrives with a starter list to apply once.
  let pendingStarter = takeStarterParam();
  const [applyingStarter, setApplyingStarter] = createSignal(!!pendingStarter);
  createEffect(() => {
    if (!pendingStarter || store.state.loading || bags.loading) return;
    const tripTypeId = pendingStarter;
    pendingStarter = null;
    if (store.renderableItems().length > 0) {
      setApplyingStarter(false);
      return;
    }
    void adder.addStarter(tripTypeId, [], firstBagId()).finally(() => setApplyingStarter(false));
  });

  const handleUpdateTripNotes = async (notes: string) => {
    const response = await api.patch(endpoints.trip(props.tripId), { notes });
    if (response.success) refetchTrip();
    else showToast('error', response.error || 'Failed to save notes');
  };

  const handleExport = () => {
    const currentTrip = trip();
    if (!currentTrip) {
      showToast('error', 'Trip data not loaded');
      return;
    }
    try {
      const yamlContent = tripToYAML(currentTrip, bags() ?? [], items() ?? []);
      const date = new Date().toISOString().split('T')[0];
      downloadYAML(yamlContent, `${currentTrip.name.replace(/[^a-z0-9]/gi, '_')}_${date}.yaml`);
      showToast('success', 'Trip exported successfully');
    } catch (error) {
      showToast('error', 'Failed to export trip');
      console.error(error);
    }
  };

  const handleDeleteTrip = () => {
    const currentTrip = trip();
    if (!currentTrip) return;
    void deleteTripWithConfirm(currentTrip.id, currentTrip.name, () => {
      window.location.href = '/trips';
    });
  };

  const listProps: PackingListProps = {
    items: search.results,
    bags,
    categories,
    selectMode,
    selectedItems,
    showUnpackedOnly,
    onTogglePacked: togglePacked,
    onEditItem: setEditingItem,
    onOpenItemActions: setActionItem,
    onToggleItemSelection: toggleItemSelection,
    onMoveItemToBag: moveItemToBag,
    onMoveItemToContainer: moveItemToContainer,
  };

  const notes = () => trip()?.notes?.trim() ?? '';

  return (
    <div class="flex h-screen flex-col bg-gray-50">
      <Toast />

      <PackingPageHeader
        trip={trip}
        stats={store.stats}
        itemCount={() => store.renderableItems().length}
        selectMode={selectMode}
        sortBy={sortBy}
        showUnpackedOnly={showUnpackedOnly}
        onToggleShowUnpackedOnly={() => setShowUnpackedOnly(!showUnpackedOnly())}
        onToggleSelectMode={toggleSelectMode}
        onToggleSortBy={() => setSortBy(sortBy() === 'bag' ? 'category' : 'bag')}
        onManageBags={() => setShowBagManager(true)}
        onShowNotes={() => setShowNotesPanel(true)}
        onExport={handleExport}
        onImport={() => setShowImport(true)}
        onClearAll={handleClearAll}
        onDeleteTrip={handleDeleteTrip}
        onEditTrip={() => setShowEditTrip(true)}
        searchQuery={search.query}
        onSearchChange={search.setQuery}
        searchHasExactMatch={search.hasExactMatch}
        onAddNamed={(name) => openAddForm(firstBagId(), null, name)}
        visibleItemCount={() => search.results()?.length ?? 0}
        onScrollToItemRequest={search.scrollToItem}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
      />

      {/* Main content - scrollable area */}
      <main class="flex-1 overflow-y-auto">
        <Show when={viewMode() === 'add'}>
          <Show when={!store.state.loading} fallback={<LoadingSpinner text="Loading..." />}>
            <AddModeView
              items={items}
              bags={bags}
              masterItems={masterItems}
              onAddItems={adder.addItems}
              onAddStarter={adder.addStarter}
              onRemoveFromTrip={removeFromTrip}
              onAddNewItem={(target, name) => openAddForm(target.bagId, target.containerId, name)}
              onManageBags={() => setShowBagManager(true)}
              onReplaceBag={setReplacingBag}
            />
          </Show>
        </Show>

        <Show when={viewMode() === 'pack'}>
          <div class="container mx-auto px-2 pt-2 pb-20 md:px-3 md:pt-3 md:pb-16">
            <Show when={showNotesPanel()}>
              <TripNotesPanel
                notes={trip()?.notes || ''}
                onNotesChange={handleUpdateTripNotes}
                onClose={() => setShowNotesPanel(false)}
              />
            </Show>
            <Show when={!showNotesPanel() && notes()}>
              <button
                type="button"
                onClick={() => setShowNotesPanel(true)}
                class="mb-2 flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-left text-sm text-amber-900"
              >
                <span class="flex-shrink-0 font-medium">Notes</span>
                <span class="min-w-0 flex-1 truncate text-amber-800/80">{notes()}</span>
              </button>
            </Show>
            <Show
              when={!store.state.loading && !applyingStarter()}
              fallback={
                <LoadingSpinner
                  text={applyingStarter() ? 'Setting up your list…' : 'Loading items...'}
                />
              }
            >
              <Show
                when={!store.state.error}
                fallback={
                  <EmptyState
                    icon="⚠️"
                    title="Unable to connect"
                    description="Cannot reach the server. Please check your connection and try again."
                    action={<Button onClick={retryLoad}>Retry</Button>}
                  />
                }
              >
                <Show
                  when={store.renderableItems().length > 0}
                  fallback={
                    <StarterListPanel
                      tripName={trip()?.name ?? ''}
                      bags={bags}
                      onAddStarter={adder.addStarter}
                      onAddItems={() => setViewMode('add')}
                    />
                  }
                >
                  <Show
                    when={!search.noResults()}
                    fallback={
                      <p class="py-16 text-center text-gray-500">
                        Nothing on this list matches “{search.query().trim()}”.
                      </p>
                    }
                  >
                    <Show
                      when={sortBy() === 'bag'}
                      fallback={<PackingListCategoryView {...listProps} />}
                    >
                      <PackingListBagView
                        {...listProps}
                        onAddToBag={(bagId) => openAddForm(bagId)}
                        onAddToContainer={(containerId) => openAddForm(null, containerId)}
                        onReplaceBag={setReplacingBag}
                      />
                    </Show>
                  </Show>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </main>

      <Show when={addFormTarget()}>
        {(target) => (
          <AddTripItemForm
            tripId={props.tripId}
            preSelectedBagId={target().bagId}
            preSelectedContainerId={target().containerId}
            initialName={target().name}
            bags={bags()}
            categories={categories()}
            tripItems={items()}
            masterItems={masterItems()}
            onDataChanged={() => {
              refetchCategories();
              refetchMasterItems();
            }}
            onClose={() => setAddFormTarget(null)}
            onSaved={(createdItem) => {
              if (createdItem) store.local.upsert([createdItem]);
              else void store.refresh(true);
            }}
          />
        )}
      </Show>

      <Show when={actionItem()}>
        {(item) => (
          <ItemActionSheet
            item={item()}
            bags={[...(bags() ?? [])].sort(byName)}
            containers={containers().filter((c) => c.id !== item().id)}
            onMoveToBag={(bagId) => moveItemToBag(item().id, bagId)}
            onMoveToContainer={(containerId) => moveItemToContainer(item().id, containerId)}
            onToggleSkipped={() => toggleSkipped(item())}
            onEdit={() => setEditingItem(item())}
            onDelete={() => removeFromTrip(item().id)}
            onClose={() => setActionItem(null)}
          />
        )}
      </Show>

      <Show when={replacingBag()}>
        {(bag) => (
          <ReplaceBagModal
            tripId={props.tripId}
            currentBag={bag()}
            tripBags={bags()}
            onClose={() => setReplacingBag(null)}
            onReplaced={reloadItemsAndBags}
          />
        )}
      </Show>

      <Show when={editingItem()}>
        {(item) => (
          <EditTripItem
            tripId={props.tripId}
            item={item()}
            allItems={items()}
            bags={bags()}
            categories={categories()}
            onDataChanged={refetchCategories}
            onClose={() => setEditingItem(null)}
            onSaved={handleEditItemSaved}
            onDelete={() => deleteItem(item())}
            onDeleted={handleContainerDeleted}
          />
        )}
      </Show>

      <Show when={showBagManager()}>
        <BagManager
          tripId={props.tripId}
          onClose={() => setShowBagManager(false)}
          onSaved={reloadItemsAndBags}
        />
      </Show>

      <Show when={showImport()}>
        <TripImportModal
          tripId={props.tripId}
          onClose={() => setShowImport(false)}
          onImported={reloadItemsAndBags}
        />
      </Show>

      <Show when={showEditTrip() && trip()}>
        {(currentTrip) => (
          <TripForm
            trip={currentTrip()}
            onClose={() => setShowEditTrip(false)}
            onSaved={() => {
              setShowEditTrip(false);
              refetchTrip();
            }}
          />
        )}
      </Show>

      <Show when={selectMode() && selectedItems().size > 0}>
        <SelectModeActionBar
          selectedCount={() => selectedItems().size}
          bags={bags}
          categories={categories}
          containers={containers}
          onAssignToBag={(bagId) =>
            patchSelection(
              { bag_id: bagId, container_item_id: null },
              (n) => `Moved ${itemCount(n)} to ${bagName(bagId)}`
            )
          }
          onAssignToContainer={assignSelectionToContainer}
          onAssignToCategory={assignSelectionToCategory}
          onSkipAll={() => patchSelection({ is_skipped: true }, (n) => `Skipped ${itemCount(n)}`)}
          onUnskipAll={() =>
            patchSelection({ is_skipped: false }, (n) => `Unskipped ${itemCount(n)}`)
          }
          onDeleteAll={() =>
            void store.deleteItems(takeSelection(), { label: (n) => `Deleted ${itemCount(n)}` })
          }
        />
      </Show>
    </div>
  );
}
