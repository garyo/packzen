import { createResource, For, Show, createSignal } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { MasterItem, Bag } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';

interface AddFromMasterListProps {
  tripId: string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddFromMasterList(props: AddFromMasterListProps) {
  const [addingItems, setAddingItems] = createSignal<Set<string>>(new Set());
  const [selectedBag, setSelectedBag] = createSignal<string | null>(null);

  const [masterItems] = createResource<MasterItem[]>(async () => {
    const response = await api.get<MasterItem[]>(endpoints.masterItems);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const [bags] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
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
    <Modal title="Add from Master List" onClose={props.onClose}>
      {/* Bag Selector */}
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Add items to bag (optional):
        </label>
        <select
          value={selectedBag() || ''}
          onChange={(e) => setSelectedBag(e.target.value || null)}
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">No bag (add to trip)</option>
          <For each={bags()}>
            {(bag) => <option value={bag.id}>{bag.name}</option>}
          </For>
        </select>
      </div>

      <div class="space-y-4 max-h-96 overflow-y-auto">
        <Show when={!masterItems.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={(masterItems()?.length || 0) > 0}
            fallback={
              <div class="text-center py-8 text-gray-500">
                <p>No items in master list</p>
                <p class="text-sm mt-2">Add items to your master list first</p>
              </div>
            }
          >
            <For each={Array.from(groupedItems().entries())}>
              {([category, items]) => (
                <div class="border-b border-gray-200 last:border-0 pb-4 last:pb-0">
                  <h3 class="font-semibold text-gray-900 mb-2">{category}</h3>
                  <div class="space-y-2">
                    <For each={items}>
                      {(item) => {
                        const isAdding = () => addingItems().has(item.id);
                        return (
                          <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
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
