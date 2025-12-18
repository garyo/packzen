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
  allItems?: TripItem[]; // All trip items for container selection
  onClose: () => void;
  onSaved: () => void;
}

export function EditTripItem(props: EditTripItemProps) {
  const [name, setName] = createSignal(props.item.name);
  const [quantity, setQuantity] = createSignal(props.item.quantity);
  const [bagId, setBagId] = createSignal<string | null>(null);
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [isNewCategory, setIsNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal('');
  const [isContainer, setIsContainer] = createSignal(props.item.is_container || false);
  const [containerItemId, setContainerItemId] = createSignal<string | null>(
    props.item.container_item_id || null
  );

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

  // Get available containers (containers that are not this item, and not inside this item if this is a container)
  const availableContainers = () => {
    const items = props.allItems || [];
    return items.filter(
      (item) =>
        item.is_container &&
        item.id !== props.item.id && // Can't put item in itself
        item.container_item_id !== props.item.id // Can't put item in something that's inside it
    );
  };

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

    // Validate container constraints
    if (isContainer() && containerItemId()) {
      showToast('error', 'A container cannot be placed inside another container');
      return;
    }

    const patchData = {
      id: props.item.id,
      name: name().trim(),
      quantity: quantity(),
      bag_id: containerItemId() ? null : bagId(), // If inside a container, clear bag_id
      category_name: finalCategoryName || null,
      is_container: isContainer(),
      container_item_id: isContainer() ? null : containerItemId(), // Containers can't be in containers
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
    <Modal title="Edit Item" onClose={props.onClose}>
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <Input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Item name"
          />
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

        {/* Container toggle */}
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            id="is-container"
            checked={isContainer()}
            onChange={(e) => {
              setIsContainer(e.currentTarget.checked);
              if (e.currentTarget.checked) {
                setContainerItemId(null); // Containers can't be inside containers
              }
            }}
            class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="is-container" class="text-sm font-medium text-gray-700">
            This is a container (sub-bag)
          </label>
        </div>

        {/* Container assignment (only show if not a container itself) */}
        <Show when={!isContainer() && availableContainers().length > 0}>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Inside Container</label>
            <select
              value={containerItemId() || ''}
              onChange={(e) => {
                setContainerItemId(e.target.value || null);
                if (e.target.value) {
                  setBagId(null); // Clear bag if assigning to container
                }
              }}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Not in a container</option>
              <For each={availableContainers()}>
                {(container) => <option value={container.id}>📦 {container.name}</option>}
              </For>
            </select>
            <p class="mt-1 text-xs text-gray-500">
              Place this item inside a container like a toilet kit
            </p>
          </div>
        </Show>

        {/* Bag assignment (only show if not inside a container) */}
        <Show when={!containerItemId()}>
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
        </Show>

        <div class="flex gap-2 pt-4">
          <Button onClick={handleSave} class="flex-1">
            Save
          </Button>
          <button
            onClick={handleDelete}
            class="p-2 text-gray-400 hover:text-red-600"
            title="Delete item"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </Modal>
  );
}
