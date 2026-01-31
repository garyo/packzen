import { createEffect, For, Show, createSignal, createMemo, type Accessor } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { MasterItemWithCategory, Bag, TripItem } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';

interface AddFromMasterListProps {
  tripId: string;
  preSelectedBagId?: string | null;
  preSelectedContainerId?: string | null;
  bags: Accessor<Bag[] | undefined>;
  tripItems: Accessor<TripItem[] | undefined>;
  masterItems: Accessor<MasterItemWithCategory[] | undefined>;
  onClose: () => void;
  onAdded: () => void; // Legacy fallback
  onItemAdded?: (item: TripItem) => void;
  onItemUpdated?: (itemId: string, updates: Partial<TripItem>) => void;
  onItemRemoved?: (itemId: string) => void;
}

export function AddFromMasterList(props: AddFromMasterListProps) {
  const [pendingItems, setPendingItems] = createSignal<Set<string>>(new Set());
  const [selectedBag, setSelectedBag] = createSignal<string | null>(null);
  const [selectedContainer, setSelectedContainer] = createSignal<string | null>(null);
  const [tripItemOverrides, setTripItemOverrides] = createSignal<Map<string, Partial<TripItem>>>(
    new Map()
  );
  const [removedTripItemIds, setRemovedTripItemIds] = createSignal<Set<string>>(new Set());

  const effectiveTripItems = createMemo(() => {
    const overrides = tripItemOverrides();
    const removed = removedTripItemIds();
    const base = props.tripItems() || [];
    return base
      .filter((item) => !removed.has(item.id))
      .map((item) => (overrides.has(item.id) ? { ...item, ...overrides.get(item.id)! } : item));
  });

  createEffect(() => {
    props.tripItems();
    setTripItemOverrides(new Map());
    setRemovedTripItemIds(new Set());
  });

  const bagLookup = createMemo(() => {
    const map = new Map<string, string>();
    (props.bags() || []).forEach((bag) => {
      map.set(bag.id, bag.name);
    });
    return map;
  });

  const tripItemsByMaster = createMemo(() => {
    const map = new Map<string, TripItem[]>();
    (effectiveTripItems() || []).forEach((item) => {
      if (!item.master_item_id) return;
      if (!map.has(item.master_item_id)) {
        map.set(item.master_item_id, []);
      }
      map.get(item.master_item_id)!.push(item);
    });
    return map;
  });

  const tripItemLookup = createMemo(() => {
    const map = new Map<string, TripItem>();
    (effectiveTripItems() || []).forEach((item) => map.set(item.id, item));
    return map;
  });

  const resolveBagName = (item: TripItem, visited = new Set<string>()): string => {
    if (visited.has(item.id)) return 'No bag';
    visited.add(item.id);

    if (item.bag_id) {
      return bagLookup().get(item.bag_id) || 'Unknown bag';
    }

    if (item.container_item_id) {
      const container = tripItemLookup().get(item.container_item_id);
      if (container) {
        return resolveBagName(container, visited);
      }
    }

    return 'No bag';
  };

  const getExistingItemsForMaster = (masterId: string) => {
    return tripItemsByMaster().get(masterId) || [];
  };

  const summarizeBagLocations = (items: TripItem[]) => {
    if (items.length === 0) return null;
    const bagNames = Array.from(new Set(items.map((item) => resolveBagName(item))));
    if (bagNames.length === 1) {
      return bagNames[0];
    }
    return `${bagNames[0]} +${bagNames.length - 1} more`;
  };

  const getTargetExistingItem = (masterId: string) => {
    const existing = getExistingItemsForMaster(masterId);
    if (existing.length === 0) return null;

    const containerId = selectedContainer();
    if (containerId) {
      const containerMatch = existing.find((item) => item.container_item_id === containerId);
      if (containerMatch) return containerMatch;
    }

    const bagId = selectedBag();
    if (bagId) {
      const bagMatch = existing.find((item) => !item.container_item_id && item.bag_id === bagId);
      if (bagMatch) return bagMatch;
    }

    return existing[0] || null;
  };

  // Set pre-selected values from props using createEffect for proper reactivity
  // Wait for resources to load before setting to ensure dropdown options exist
  createEffect(() => {
    if (props.bags() && props.preSelectedBagId) {
      setSelectedBag(props.preSelectedBagId);
    }
    if (props.tripItems() && props.preSelectedContainerId) {
      setSelectedContainer(props.preSelectedContainerId);
    }
  });

  // Get available containers
  const availableContainers = () => {
    const items = effectiveTripItems() || [];
    return items.filter((item) => item.is_container);
  };

  const handleAddItem = async (item: MasterItemWithCategory) => {
    setPendingItems((prev) => new Set(prev).add(item.id));
    const existingMatch = getTargetExistingItem(item.id);
    const defaultQuantity = item.default_quantity || 1;

    try {
      if (existingMatch) {
        const newQuantity = (existingMatch.quantity || 0) + 1;
        const response = await api.patch(endpoints.tripItems(props.tripId), {
          id: existingMatch.id,
          quantity: newQuantity,
        });

        if (response.success) {
          showToast('success', `Updated ${item.name} count`);
          setTripItemOverrides((prev) => {
            const next = new Map(prev);
            next.set(existingMatch.id, { quantity: newQuantity });
            return next;
          });
          // Use specific callback if available, otherwise fallback
          if (props.onItemUpdated) {
            props.onItemUpdated(existingMatch.id, { quantity: newQuantity });
          } else {
            props.onAdded();
          }
        } else {
          showToast('error', response.error || 'Failed to update item');
        }
        return;
      }

      const containerId = selectedContainer();
      const bagId = containerId ? null : selectedBag() || null;

      const response = await api.post(endpoints.tripItems(props.tripId), {
        name: item.name,
        category_name: item.category_name,
        quantity: defaultQuantity,
        master_item_id: item.id,
        bag_id: bagId,
        container_item_id: containerId || null,
        is_container: item.is_container || false,
      });

      if (response.success) {
        showToast('success', `Added ${item.name}`);
        // Use specific callback if available, otherwise fallback
        const createdItem = response.data as TripItem | undefined;
        if (props.onItemAdded && createdItem) {
          props.onItemAdded(createdItem);
        } else {
          props.onAdded();
        }
      } else {
        showToast('error', response.error || 'Failed to add item');
      }
    } finally {
      setPendingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleRemoveItem = async (item: MasterItemWithCategory) => {
    const existingMatch = getTargetExistingItem(item.id);
    if (!existingMatch) return;

    setPendingItems((prev) => new Set(prev).add(item.id));
    try {
      const response = await api.delete(endpoints.tripItems(props.tripId), {
        body: JSON.stringify({ id: existingMatch.id }),
      });

      if (response.success) {
        showToast('success', `Removed ${item.name}`);
        setRemovedTripItemIds((prev) => {
          const next = new Set(prev);
          next.add(existingMatch.id);
          return next;
        });
        setTripItemOverrides((prev) => {
          const next = new Map(prev);
          next.delete(existingMatch.id);
          return next;
        });
        // Use specific callback if available, otherwise fallback
        if (props.onItemRemoved) {
          props.onItemRemoved(existingMatch.id);
        } else {
          props.onAdded();
        }
      } else {
        showToast('error', response.error || 'Failed to remove item');
      }
    } finally {
      setPendingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const groupedItems = () => {
    const items = props.masterItems();
    if (!items) return new Map<string, MasterItemWithCategory[]>();

    const groups = new Map<string, MasterItemWithCategory[]>();
    items.forEach((item) => {
      const category = item.category_name || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    });
    return groups;
  };

  return (
    <Modal title="Add from My Saved Items" onClose={props.onClose}>
      {/* Container Selector (if containers exist) */}
      <Show when={availableContainers().length > 0}>
        <div class="mb-4">
          <label class="mb-2 block text-sm font-medium text-gray-700">
            Add items to container (optional):
          </label>
          <select
            value={selectedContainer() || ''}
            onChange={(e) => {
              setSelectedContainer(e.target.value || null);
              if (e.target.value) {
                setSelectedBag(null); // Clear bag if selecting container
              }
            }}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Not in a container</option>
            <For each={availableContainers()}>
              {(container) => <option value={container.id}>📦 {container.name}</option>}
            </For>
          </select>
        </div>
      </Show>

      {/* Bag Selector (only show if not using container) */}
      <Show when={!selectedContainer()}>
        <div class="mb-4">
          <label class="mb-2 block text-sm font-medium text-gray-700">
            Add items to bag (optional):
          </label>
          <select
            value={selectedBag() || ''}
            onChange={(e) => setSelectedBag(e.target.value || null)}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No bag (add to trip)</option>
            <For each={props.bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
          </select>
        </div>
      </Show>

      <div class="max-h-96 space-y-4 overflow-y-auto">
        <Show when={props.masterItems()} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={(props.masterItems()?.length || 0) > 0}
            fallback={
              <div class="py-8 text-center text-gray-500">
                <p>No items in All Items list</p>
                <p class="mt-2 text-sm">Add items to your All Items list first</p>
              </div>
            }
          >
            <For each={Array.from(groupedItems().entries())}>
              {([category, items]) => (
                <div class="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                  <h3 class="mb-2 font-semibold text-gray-900">{category}</h3>
                  <div class="space-y-2">
                    <For each={items}>
                      {(item) => {
                        const isAdding = () => pendingItems().has(item.id);
                        const existingItems = () => getExistingItemsForMaster(item.id);
                        const targetExisting = () => getTargetExistingItem(item.id);
                        const bagSummary = () => summarizeBagLocations(existingItems());
                        const alreadyPacked = () => existingItems().length > 0;
                        const totalExistingQuantity = () =>
                          existingItems().reduce(
                            (sum, tripItem) => sum + (tripItem.quantity || 0),
                            0
                          );
                        const displayedQuantity = () =>
                          totalExistingQuantity() > 0
                            ? totalExistingQuantity()
                            : item.default_quantity;
                        return (
                          <div class="flex items-center justify-between rounded p-2 hover:bg-gray-50">
                            <div class="flex-1">
                              <p
                                class="flex items-center gap-2 font-medium"
                                classList={{
                                  'text-gray-500': alreadyPacked(),
                                  'text-gray-900': !alreadyPacked(),
                                }}
                              >
                                <Show when={item.is_container}>
                                  <span title="Container (sub-bag)">📦</span>
                                </Show>
                                {item.name}
                              </p>
                              {item.description && (
                                <p class="text-sm text-gray-600">{item.description}</p>
                              )}
                              <p class="text-xs text-gray-500">Qty: {displayedQuantity()}</p>
                              <Show when={bagSummary()}>
                                {(summary) => <p class="text-xs text-gray-500">In {summary}</p>}
                              </Show>
                            </div>
                            <div class="flex items-center gap-2">
                              <Show when={alreadyPacked()}>
                                <button
                                  type="button"
                                  class="rounded-full p-2 text-gray-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Remove from trip"
                                  onClick={() => handleRemoveItem(item)}
                                  disabled={isAdding()}
                                >
                                  <svg
                                    class="h-4 w-4"
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
                              </Show>
                              <Button
                                size="sm"
                                variant={alreadyPacked() ? 'secondary' : 'primary'}
                                onClick={() => handleAddItem(item)}
                                disabled={isAdding()}
                              >
                                {isAdding()
                                  ? alreadyPacked()
                                    ? 'Updating...'
                                    : 'Adding...'
                                  : alreadyPacked()
                                    ? '+'
                                    : '+ Add'}
                              </Button>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
      <div class="mt-6 flex justify-end">
        <Button variant="secondary" onClick={props.onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
