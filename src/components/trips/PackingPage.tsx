import { createSignal, createResource, For, Show, onMount, onCleanup } from 'solid-js';
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
  const [showMenu, setShowMenu] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<'bag' | 'category'>('bag');
  let menuRef: HTMLDivElement | undefined;

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

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showMenu()) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
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
    setSelectedItems(new Set());
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
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
      // Update all selected items
      await Promise.all(
        itemsToUpdate.map((itemId) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: itemId,
            bag_id: bagId === '' ? null : bagId,
          })
        )
      );

      showToast('success', `Assigned ${itemsToUpdate.length} items to bag`);
      await refetch();
      setSelectMode(false);
      setSelectedItems(new Set());
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

  const itemsByBag = () => {
    const allItems = items() || [];
    const allBags = bags() || [];
    const grouped = new Map<string | null, Map<string, TripItem[]>>();

    // Group items by bag_id, then by category
    allItems.forEach((item) => {
      const bagId = item.bag_id || null;
      const category = item.category_name || 'Uncategorized';

      if (!grouped.has(bagId)) {
        grouped.set(bagId, new Map());
      }

      const bagCategories = grouped.get(bagId)!;
      if (!bagCategories.has(category)) {
        bagCategories.set(category, []);
      }

      bagCategories.get(category)!.push(item);
    });

    // Add virtual "Wearing" bag to the list
    const bagsWithWearing = [
      ...allBags,
      {
        id: null as any,
        trip_id: props.tripId,
        name: 'Wearing / No Bag',
        type: 'wearing' as any,
        color: null,
        sort_order: 999,
        created_at: new Date().toISOString(),
      },
    ];

    return { grouped, allBags: bagsWithWearing };
  };

  const itemsByCategory = () => {
    const allItems = items() || [];
    const allBags = bags() || [];
    const grouped = new Map<string, Map<string | null, TripItem[]>>();

    // Group items by category, then by bag_id
    allItems.forEach((item) => {
      const category = item.category_name || 'Uncategorized';
      const bagId = item.bag_id || null;

      if (!grouped.has(category)) {
        grouped.set(category, new Map());
      }

      const categoryBags = grouped.get(category)!;
      if (!categoryBags.has(bagId)) {
        categoryBags.set(bagId, []);
      }

      categoryBags.get(bagId)!.push(item);
    });

    // Add virtual "Wearing" bag to the list
    const bagsWithWearing = [
      ...allBags,
      {
        id: null as any,
        trip_id: props.tripId,
        name: 'Wearing / No Bag',
        type: 'wearing' as any,
        color: null,
        sort_order: 999,
        created_at: new Date().toISOString(),
      },
    ];

    return { grouped, allBags: bagsWithWearing };
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      {/* Header with Progress */}
      <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div class="container mx-auto px-4 py-4 md:py-2">
          <div class="mb-3 md:mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <a href="/trips" class="flex items-center text-gray-600 hover:text-gray-900">
                <svg class="h-5 w-5 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
              <div>
                <h1 class="text-2xl md:text-lg font-bold text-gray-900">{trip()?.name || 'Packing'}</h1>
                <p class="text-sm md:text-xs text-gray-600">
                  {packedCount()} of {totalCount()} packed
                </p>
              </div>
            </div>
            <div class="flex gap-2">
              <Show
                when={selectMode()}
                fallback={
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setShowBagManager(true)}>
                      Bags
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddFromMaster(true)}
                    >
                      + From All Items
                    </Button>
                    <Button variant="secondary" size="sm" onClick={toggleSelectMode}>
                      Select
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSortBy(sortBy() === 'bag' ? 'category' : 'bag')}
                      title={`Currently sorting by ${sortBy()}. Click to switch.`}
                    >
                      {sortBy() === 'bag' ? '👜→📁' : '📁→👜'}
                    </Button>
                    <Button size="sm" onClick={handleAddItem}>
                      + Add
                    </Button>
                    <div class="relative" ref={menuRef}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowMenu(!showMenu())}
                      >
                        ⋮
                      </Button>
                      <Show when={showMenu()}>
                        <div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                          <button
                            onClick={() => {
                              handleExport();
                              setShowMenu(false);
                            }}
                            class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                          >
                            Export Trip
                          </button>
                          <button
                            onClick={() => {
                              setShowImport(true);
                              setShowMenu(false);
                            }}
                            class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                          >
                            Import/Merge Trip
                          </button>
                          <button
                            onClick={() => {
                              handleClearAll();
                              setShowMenu(false);
                            }}
                            class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600"
                          >
                            Clear All (Unpack)
                          </button>
                        </div>
                      </Show>
                    </div>
                  </>
                }
              >
                <Button variant="secondary" size="sm" onClick={toggleSelectMode}>
                  Cancel
                </Button>
              </Show>
            </div>
          </div>

          {/* Progress Bar */}
          <div class="h-3 w-full rounded-full bg-gray-200">
            <div
              class="h-3 rounded-full bg-green-600 transition-all duration-300"
              style={{ width: `${progress()}%` }}
            />
          </div>
        </div>
      </header>

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
                /* Category-first view */
                <div class="space-y-6 md:space-y-3">
                  <For each={Array.from(itemsByCategory().grouped.entries())}>
                    {([category, categoryBags]) => {
                      const totalItems = () =>
                        Array.from(categoryBags.values()).reduce(
                          (sum, items) => sum + items.length,
                          0
                        );
                      return (
                        <Show when={totalItems() > 0}>
                          <div>
                            <div class="mb-3 md:mb-1.5 flex items-center gap-2">
                              <h2 class="text-lg md:text-base font-semibold text-gray-900">
                                📁 {category}
                              </h2>
                              <span class="text-sm md:text-xs text-gray-500">({totalItems()})</span>
                            </div>
                            <For each={Array.from(categoryBags.entries())}>
                              {([bagId, bagItems]) => {
                                const bag = () =>
                                  itemsByCategory().allBags.find((b) => b.id === bagId);
                                return (
                                  <div class="mb-4 md:mb-2">
                                    <h3 class="mb-2 md:mb-1 px-1 text-sm md:text-xs font-medium text-gray-600">
                                      {bag()?.name || 'No bag'}
                                    </h3>
                                    <div
                                      class="grid gap-2 md:gap-1.5"
                                      style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                                    >
                                      <For each={bagItems}>
                                        {(item) => (
                                          <div
                                            class={`flex items-center gap-4 md:gap-2 rounded-lg bg-white p-4 md:p-2 shadow-sm ${item.is_packed ? 'opacity-60' : ''} ${selectMode() && selectedItems().has(item.id) ? 'ring-2 ring-blue-500' : ''} `}
                                          >
                                            <Show when={!selectMode()}>
                                              <input
                                                type="checkbox"
                                                checked={item.is_packed}
                                                onChange={() => handleTogglePacked(item)}
                                                class="h-8 w-8 md:h-6 md:w-6 cursor-pointer rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500"
                                              />
                                            </Show>
                                            <div class="flex-1">
                                              <p
                                                class={`text-lg md:text-base font-medium ${item.is_packed ? 'text-gray-500 line-through' : 'text-gray-900'}`}
                                              >
                                                {item.name}
                                              </p>
                                              <div class="mt-1 md:mt-0.5 flex gap-3 md:gap-2 text-sm md:text-xs text-gray-500">
                                                {bag() && <span>👜 {bag()!.name}</span>}
                                                {item.quantity > 1 && <span>×{item.quantity}</span>}
                                              </div>
                                            </div>
                                            <Show
                                              when={selectMode()}
                                              fallback={
                                                <button
                                                  onClick={() => setEditingItem(item)}
                                                  class="p-2 text-gray-400 transition-colors hover:text-blue-600"
                                                  aria-label="Edit item"
                                                >
                                                  <svg
                                                    class="h-5 w-5"
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
                                              }
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selectedItems().has(item.id)}
                                                onChange={() => toggleItemSelection(item.id)}
                                                class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                              />
                                            </Show>
                                          </div>
                                        )}
                                      </For>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      );
                    }}
                  </For>
                </div>
              }
            >
              {/* Bag-first view */}
              <div class="space-y-6 md:space-y-3">
                {/* Items grouped by bag */}
                <For each={itemsByBag().allBags}>
                {(bag) => {
                  const bagCategories = () => itemsByBag().grouped.get(bag.id) || new Map();
                  const totalItems = () =>
                    Array.from(bagCategories().values()).reduce(
                      (sum, items) => sum + items.length,
                      0
                    );
                  return (
                    <Show when={totalItems() > 0}>
                      <div>
                        <div class="mb-3 md:mb-1.5 flex items-center gap-2">
                          <Show
                            when={bag.id !== null}
                            fallback={<span class="text-lg md:text-base">👕</span>}
                          >
                            <div
                              class={`h-3 w-3 md:h-2.5 md:w-2.5 rounded-full ${
                                bag.color === 'blue'
                                  ? 'bg-blue-500'
                                  : bag.color === 'red'
                                    ? 'bg-red-500'
                                    : bag.color === 'green'
                                      ? 'bg-green-500'
                                      : bag.color === 'yellow'
                                        ? 'bg-yellow-500'
                                        : bag.color === 'purple'
                                          ? 'bg-purple-500'
                                          : bag.color === 'black'
                                            ? 'bg-black'
                                            : 'bg-gray-500'
                              }`}
                            />
                          </Show>
                          <h2 class="text-lg md:text-base font-semibold text-gray-900">{bag.name}</h2>
                          <span class="text-sm md:text-xs text-gray-500">({totalItems()})</span>
                        </div>
                        <For each={Array.from(bagCategories().entries())}>
                          {([category, categoryItems]) => (
                            <div class="mb-4 md:mb-2">
                              <h3 class="mb-2 md:mb-1 px-1 text-sm md:text-xs font-medium text-gray-600">
                                {category}
                              </h3>
                              <div
                                class="grid gap-2 md:gap-1.5"
                                style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                              >
                                <For each={categoryItems}>
                                  {(item) => (
                                    <div
                                      class={`flex items-center gap-4 md:gap-2 rounded-lg bg-white p-4 md:p-2 shadow-sm ${item.is_packed ? 'opacity-60' : ''} ${selectMode() && selectedItems().has(item.id) ? 'ring-2 ring-blue-500' : ''} `}
                                    >
                                      <Show when={!selectMode()}>
                                        <input
                                          type="checkbox"
                                          checked={item.is_packed}
                                          onChange={() => handleTogglePacked(item)}
                                          class="h-8 w-8 md:h-6 md:w-6 cursor-pointer rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500"
                                        />
                                      </Show>
                                      <div class="flex-1">
                                        <p
                                          class={`text-lg md:text-base font-medium ${item.is_packed ? 'text-gray-500 line-through' : 'text-gray-900'}`}
                                        >
                                          {item.name}
                                        </p>
                                        <div class="mt-1 md:mt-0.5 flex gap-3 md:gap-2 text-sm md:text-xs text-gray-500">
                                          {item.category_name && (
                                            <span>📁 {item.category_name}</span>
                                          )}
                                          {item.quantity > 1 && <span>×{item.quantity}</span>}
                                        </div>
                                      </div>
                                      <Show
                                        when={selectMode()}
                                        fallback={
                                          <button
                                            onClick={() => setEditingItem(item)}
                                            class="p-2 text-gray-400 transition-colors hover:text-blue-600"
                                            aria-label="Edit item"
                                          >
                                            <svg
                                              class="h-5 w-5"
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
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selectedItems().has(item.id)}
                                          onChange={() => toggleItemSelection(item.id)}
                                          class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                        />
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  );
                }}
              </For>
              </div>
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
        <div class="fixed right-0 bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-white shadow-lg">
          <div class="container mx-auto px-4 py-4">
            <div class="flex items-center justify-between gap-4">
              <span class="font-medium text-gray-900">
                {selectedItems().size} item{selectedItems().size !== 1 ? 's' : ''} selected
              </span>
              <div class="flex items-center gap-3">
                <label class="text-sm font-medium text-gray-700">Assign to:</label>
                <select
                  onChange={(e) => handleBatchAssignToBag(e.target.value)}
                  class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a bag...</option>
                  <option value="">No bag</option>
                  <For each={bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
                </select>
              </div>
            </div>
          </div>
        </div>
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
