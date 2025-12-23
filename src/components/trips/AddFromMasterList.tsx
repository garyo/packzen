import { createEffect, For, Show, createSignal, type Accessor } from 'solid-js';
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
  onAdded: () => void;
}

export function AddFromMasterList(props: AddFromMasterListProps) {
  const [addingItems, setAddingItems] = createSignal<Set<string>>(new Set());
  const [selectedBag, setSelectedBag] = createSignal<string | null>(null);
  const [selectedContainer, setSelectedContainer] = createSignal<string | null>(null);

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
    const items = props.tripItems() || [];
    return items.filter((item) => item.is_container);
  };

  const handleAddItem = async (item: MasterItemWithCategory) => {
    // Optimistically mark as adding
    setAddingItems((prev) => new Set(prev).add(item.id));

    const response = await api.post(endpoints.tripItems(props.tripId), {
      name: item.name,
      category_name: item.category_name,
      quantity: item.default_quantity,
      master_item_id: item.id,
      bag_id: selectedContainer() ? null : selectedBag() || null, // Clear bag if using container
      container_item_id: selectedContainer() || null,
      is_container: item.is_container || false,
    });

    if (response.success) {
      showToast('success', `Added ${item.name}`);
      props.onAdded();
    } else {
      showToast('error', response.error || 'Failed to add item');
      // Remove from adding set on error
      setAddingItems((prev) => {
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
    <Modal title="Add from My Items" onClose={props.onClose}>
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
                        const isAdding = () => addingItems().has(item.id);
                        return (
                          <div class="flex items-center justify-between rounded p-2 hover:bg-gray-50">
                            <div class="flex-1">
                              <p class="flex items-center gap-2 font-medium text-gray-900">
                                <Show when={item.is_container}>
                                  <span title="Container (sub-bag)">📦</span>
                                </Show>
                                {item.name}
                              </p>
                              {item.description && (
                                <p class="text-sm text-gray-600">{item.description}</p>
                              )}
                              <p class="text-xs text-gray-500">Qty: {item.default_quantity}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleAddItem(item)}
                              disabled={isAdding()}
                            >
                              {isAdding() ? 'Added' : '+ Add'}
                            </Button>
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
