import { createSignal, createResource, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripItem, Bag } from '../../lib/types';
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
import { fetchWithErrorHandling, fetchSingleWithErrorHandling } from '../../lib/resource-helpers';
import { tripToYAML, downloadYAML } from '../../lib/yaml';

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
  const [sortBy, setSortBy] = createSignal<'bag' | 'category'>('bag');

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

    try {
      await Promise.all(
        itemsToUpdate.map((itemId) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: itemId,
            bag_id: bagId,
          })
        )
      );

      showToast('success', `Assigned ${itemsToUpdate.length} items to bag`);
      await refetch();
      setSelectMode(false);
      setSelectedItems(new Set<string>());
    } catch (error) {
      showToast('error', 'Failed to assign items');
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

  const packedCount = () => items()?.filter((i) => i.is_packed).length || 0;
  const totalCount = () => items()?.length || 0;
  const progress = () => getPackingProgress(packedCount(), totalCount());

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
        onExport={handleExport}
        onImport={() => setShowImport(true)}
        onClearAll={handleClearAll}
      />

      {/* Packing List */}
      <main class="container mx-auto px-4 py-6 pb-20 md:px-3 md:py-3 md:pb-16">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={totalCount() > 0}
            fallback={
              <EmptyState
                icon="📦"
                title="No items yet"
                description="Add items to your packing list to get started"
                action={<Button onClick={handleAddItem}>Add First Item</Button>}
              />
            }
          >
            <Show
              when={sortBy() === 'bag'}
              fallback={
                <PackingListCategoryView
                  items={items}
                  bags={bags}
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
                selectMode={selectMode}
                selectedItems={selectedItems}
                onTogglePacked={handleTogglePacked}
                onEditItem={setEditingItem}
                onToggleItemSelection={toggleItemSelection}
              />
            </Show>
          </Show>
        </Show>
      </main>

      {/* Add Item Form Modal */}
      <Show when={showAddForm()}>
        <AddTripItemForm
          tripId={props.tripId}
          onClose={() => setShowAddForm(false)}
          onSaved={() => refetch()}
        />
      </Show>

      {/* Edit Item Modal */}
      <Show when={editingItem()}>
        <EditTripItem
          tripId={props.tripId}
          item={editingItem()!}
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

      {/* Add from Master List Modal */}
      <Show when={showAddFromMaster()}>
        <AddFromMasterList
          tripId={props.tripId}
          onClose={() => setShowAddFromMaster(false)}
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

      {/* Bottom Action Bar (Select Mode) */}
      <Show when={selectMode() && selectedItems().size > 0}>
        <SelectModeActionBar
          selectedCount={() => selectedItems().size}
          bags={bags}
          onAssignToBag={handleBatchAssignToBag}
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
