import { createSignal, createResource, For, Show } from 'solid-js';
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
  const [keepOpen, setKeepOpen] = createSignal(false);
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

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const itemName = name().trim();
    if (!itemName) {
      showToast('error', 'Item name is required');
      return;
    }

    // Create new category if needed
    let finalCategoryId = categoryId();
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
        setCategoryId(finalCategoryId);
        await refetchCategories();
        showToast('success', `Created category "${newCatName}"`);
      } else {
        showToast('error', 'Failed to create category');
        return;
      }
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
        category_id: finalCategoryId,
        default_quantity: quantity(),
      });
      if (createMasterResponse.success) {
        masterItemId = createMasterResponse.data?.id;
        categoryName = createMasterResponse.data?.category_name;
        showToast('success', `Added "${itemName}" to all items`);
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

      if (keepOpen()) {
        // Keep form open, reset only name field and new category fields
        setName('');
        setIsNewCategory(false);
        setNewCategoryName('');
        setKeepOpen(false);
        // Focus back on name input
        setTimeout(() => {
          document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
        }, 0);
      } else {
        props.onClose();
      }
    } else {
      showToast('error', response.error || 'Failed to add item');
    }
  };

  const handleAddAnother = (e: Event) => {
    setKeepOpen(true);
    handleSubmit(e);
  };

  return (
    <Modal title="Add Item" onClose={props.onClose}>
      <form onSubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Item Name</label>
          <Input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="e.g., Toothbrush"
            autofocus
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
          <label class="mb-1 block text-sm font-medium text-gray-700">Quantity</label>
          <Input
            type="number"
            min="1"
            value={quantity()}
            onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
          />
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

        <div class="flex flex-col gap-2 pt-4">
          <Button type="button" onClick={handleAddAnother} class="w-full">
            Add Another
          </Button>
          <div class="flex gap-2">
            <Button type="submit" variant="secondary" class="flex-1">
              Add & Close
            </Button>
            <Button type="button" variant="secondary" onClick={props.onClose}>
              Close
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
