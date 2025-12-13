import { createResource, For, Show, createSignal } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { MasterItem, Bag } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';

interface AddFromMasterListProps {
  tripId: string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddFromMasterList(props: AddFromMasterListProps) {
  const [addingItems, setAddingItems] = createSignal<Set<string>>(new Set());
  const [selectedBag, setSelectedBag] = createSignal<string | null>(null);

  const [masterItems] = createResource<MasterItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<MasterItem[]>(endpoints.masterItems),
      'Failed to load items'
    );
  });

  const [bags] = createResource<Bag[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Bag[]>(endpoints.tripBags(props.tripId)),
      'Failed to load bags'
    );
  });

  const handleAddItem = async (item: MasterItem) => {
    // Optimistically mark as adding
    setAddingItems((prev) => new Set(prev).add(item.id));

    const response = await api.post(endpoints.tripItems(props.tripId), {
      name: item.name,
      category_name: item.category_name,
      quantity: item.default_quantity,
      master_item_id: item.id,
      bag_id: selectedBag() || null,
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
    const items = masterItems();
    if (!items) return new Map<string, MasterItem[]>();

    const groups = new Map<string, MasterItem[]>();
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
    <Modal title="Add from All Items" onClose={props.onClose}>
      {/* Bag Selector */}
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
          <For each={bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
        </select>
      </div>

      <div class="max-h-96 space-y-4 overflow-y-auto">
        <Show when={!masterItems.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={(masterItems()?.length || 0) > 0}
            fallback={
              <div class="py-8 text-center text-gray-500">
                <p>No items in all items list</p>
                <p class="mt-2 text-sm">Add items to your all items list first</p>
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
                              <p class="font-medium text-gray-900">{item.name}</p>
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
