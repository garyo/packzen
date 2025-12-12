import { createSignal, createResource, For } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Bag, Category } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showToast } from '../ui/Toast';

interface AddTripItemFormProps {
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTripItemForm(props: AddTripItemFormProps) {
  const [name, setName] = createSignal('');
  const [quantity, setQuantity] = createSignal(1);
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [bagId, setBagId] = createSignal<string | null>(null);

  const [bags] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const [categories] = createResource<Category[]>(async () => {
    const response = await api.get<Category[]>(endpoints.categories);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const itemName = name().trim();
    if (!itemName) {
      showToast('error', 'Item name is required');
      return;
    }

    // Check if item exists in master list
    const masterItemsResponse = await api.get<any[]>(endpoints.masterItems);
    const existingMasterItem = masterItemsResponse.data?.find(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    let masterItemId = existingMasterItem?.id;
    let categoryName: string | undefined;

    // If not in master list, add it
    if (!existingMasterItem) {
      const createMasterResponse = await api.post(endpoints.masterItems, {
        name: itemName,
        category_id: categoryId(),
        default_quantity: quantity(),
      });
      if (createMasterResponse.success) {
        masterItemId = createMasterResponse.data?.id;
        categoryName = createMasterResponse.data?.category_name;
        showToast('success', `Added "${itemName}" to master list`);
      }
    } else {
      categoryName = existingMasterItem.category_name;
    }

    // Add to trip
    const response = await api.post(endpoints.tripItems(props.tripId), {
      name: itemName,
      category_name: categoryName,
      quantity: quantity(),
      bag_id: bagId(),
      master_item_id: masterItemId,
    });

    if (response.success) {
      showToast('success', 'Item added to trip');
      props.onSaved();
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to add item');
    }
  };

  return (
    <Modal title="Add Item" onClose={props.onClose}>
      <form onSubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
          <Input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="e.g., Toothbrush"
            autofocus
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={categoryId() || ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">No category</option>
            <For each={categories()}>
              {(category) => <option value={category.id}>{category.name}</option>}
            </For>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <Input
            type="number"
            min="1"
            value={quantity()}
            onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Bag</label>
          <select
            value={bagId() || ''}
            onChange={(e) => setBagId(e.target.value || null)}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">No bag</option>
            <For each={bags()}>
              {(bag) => <option value={bag.id}>{bag.name}</option>}
            </For>
          </select>
        </div>

        <div class="flex gap-2 pt-4">
          <Button type="submit" class="flex-1">
            Add Item
          </Button>
          <Button type="button" variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
