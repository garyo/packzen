import { createSignal, createResource, For, Show, createEffect } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { TripItem, Bag, Category } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showToast } from '../ui/Toast';

interface EditTripItemProps {
  tripId: string;
  item: TripItem;
  onClose: () => void;
  onSaved: () => void;
}

export function EditTripItem(props: EditTripItemProps) {
  const [quantity, setQuantity] = createSignal(props.item.quantity);
  const [bagId, setBagId] = createSignal<string | null>(null);
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [isNewCategory, setIsNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal('');

  const [bags] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    const response = await api.get<Category[]>(endpoints.categories);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  // Initialize bag and category after resources load
  createEffect(() => {
    if (bags() && props.item.bag_id && bagId() === null) {
      setBagId(props.item.bag_id);
    }
  });

  createEffect(() => {
    if (categories() && props.item.category_name && categoryId() === null) {
      const cat = categories()!.find((c) => c.name === props.item.category_name);
      if (cat) {
        setCategoryId(cat.id);
      }
    }
  });

  const handleSave = async () => {
    // Create new category if needed
    let finalCategoryId = categoryId();
    let finalCategoryName = '';

    if (isNewCategory()) {
      const newCatName = newCategoryName().trim();
      if (!newCatName) {
        showToast('error', 'Category name is required');
        return;
      }
      const createCategoryResponse = await api.post(endpoints.categories, {
        name: newCatName,
      });
      if (createCategoryResponse.success && createCategoryResponse.data) {
        finalCategoryId = createCategoryResponse.data.id;
        finalCategoryName = newCatName;
        setCategoryId(finalCategoryId);
        await refetchCategories();
        showToast('success', `Created category "${newCatName}"`);
      } else {
        showToast('error', 'Failed to create category');
        return;
      }
    } else if (finalCategoryId) {
      // Look up category name from ID
      const cat = categories()?.find((c) => c.id === finalCategoryId);
      finalCategoryName = cat?.name || '';
    }

    const patchData = {
      id: props.item.id,
      quantity: quantity(),
      bag_id: bagId(),
      category_name: finalCategoryName || null,
    };

    const response = await api.patch(endpoints.tripItems(props.tripId), patchData);

    if (response.success) {
      showToast('success', 'Item updated');
      props.onSaved();
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to update item');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;

    const response = await api.delete(endpoints.tripItems(props.tripId), {
      body: JSON.stringify({ id: props.item.id }),
    });

    if (response.success) {
      showToast('success', 'Item deleted');
      props.onSaved();
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to delete item');
    }
  };

  return (
    <Modal title={`Edit: ${props.item.name}`} onClose={props.onClose}>
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Quantity</label>
          <Input
            type="number"
            min="1"
            value={quantity()}
            onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <Show
            when={!isNewCategory()}
            fallback={
              <div class="flex gap-2">
                <Input
                  type="text"
                  value={newCategoryName()}
                  onInput={(e) => setNewCategoryName(e.currentTarget.value)}
                  placeholder="Enter category name"
                  class="flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsNewCategory(false);
                    setNewCategoryName('');
                  }}
                  class="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            }
          >
            <select
              value={categoryId() || ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '__new__') {
                  setIsNewCategory(true);
                  setCategoryId(null);
                } else {
                  setCategoryId(value || null);
                }
              }}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No category</option>
              <For each={categories()}>
                {(category) => <option value={category.id}>{category.name}</option>}
              </For>
              <option value="__new__">+ New category...</option>
            </select>
          </Show>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Bag</label>
          <select
            value={bagId() || ''}
            onChange={(e) => setBagId(e.target.value || null)}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No bag</option>
            <For each={bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
          </select>
        </div>

        <div class="flex gap-2 pt-4">
          <Button onClick={handleSave} class="flex-1">
            Save
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
