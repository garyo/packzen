import { createSignal, createResource, For, Show, createEffect, createMemo } from 'solid-js';
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
  bags?: Bag[]; // Pre-loaded bags (avoids async fetch)
  onClose: () => void;
  onSaved: (updatedItem?: TripItem) => void;
  onDeleted?: (deletedItemId: string, movedItemIds?: string[]) => void;
}

export function EditTripItem(props: EditTripItemProps) {
  const [name, setName] = createSignal(props.item.name);
  const [quantity, setQuantity] = createSignal(props.item.quantity);
  const [notes, setNotes] = createSignal(props.item.notes || '');
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [isNewCategory, setIsNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal('');
  const [isContainer, setIsContainer] = createSignal(props.item.is_container || false);
  // Combined location - stores either "bag:id" or "container:id"
  const [location, setLocation] = createSignal<string>(
    props.item.container_item_id
      ? `container:${props.item.container_item_id}`
      : props.item.bag_id
        ? `bag:${props.item.bag_id}`
        : ''
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [containedItemsCount, setContainedItemsCount] = createSignal(0);
  const [categoryInitialized, setCategoryInitialized] = createSignal(false);

  // Use pre-loaded bags if available, otherwise fetch
  const bags = () => props.bags || [];

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

  // Sort categories alphabetically
  const sortedCategories = createMemo(() => {
    const cats = categories() || [];
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Initialize category after resources load
  createEffect(() => {
    // Only initialize category once when categories load
    if (categories() && props.item.category_name && !categoryInitialized()) {
      const cat = categories()!.find((c) => c.name === props.item.category_name);
      if (cat) {
        setCategoryId(cat.id);
      }
      setCategoryInitialized(true);
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
        finalCategoryId = (createCategoryResponse.data as { id: string }).id;
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

    // Parse location to determine bag_id and container_item_id
    const loc = location();
    let bagId: string | null = null;
    let containerItemId: string | null = null;

    if (loc.startsWith('bag:')) {
      bagId = loc.substring(4);
    } else if (loc.startsWith('container:')) {
      containerItemId = loc.substring(10);
    }

    // Validate container constraints
    if (isContainer() && containerItemId) {
      showToast('error', 'A container cannot be placed inside another container');
      return;
    }

    const patchData = {
      id: props.item.id,
      name: name().trim(),
      quantity: quantity(),
      notes: notes().trim() || null,
      bag_id: containerItemId ? null : bagId, // If inside a container, clear bag_id
      category_name: finalCategoryName || null,
      is_container: isContainer(),
      container_item_id: isContainer() ? null : containerItemId, // Containers can't be in containers
    };

    const response = await api.patch(endpoints.tripItems(props.tripId), patchData);

    if (response.success) {
      showToast('success', 'Item updated');
      // Construct updated item by merging original with changes
      const updatedItem: TripItem = {
        ...props.item,
        ...patchData,
      };
      props.onSaved(updatedItem);
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to update item');
    }
  };

  const handleDelete = async () => {
    // If this is a container, check for contained items
    if (props.item.is_container && props.allItems) {
      const contained = props.allItems.filter((item) => item.container_item_id === props.item.id);

      if (contained.length > 0) {
        // Show custom confirmation dialog
        setContainedItemsCount(contained.length);
        setShowDeleteConfirm(true);
        return;
      }
    }

    // Simple delete for non-containers or empty containers
    if (!confirm('Delete this item?')) return;
    await performDelete(false);
  };

  const getContainerDestination = () => {
    const loc = location();
    if (loc.startsWith('bag:')) {
      const bagId = loc.substring(4);
      const bag = bags()?.find((b) => b.id === bagId);
      return bag ? `to ${bag.name}` : 'to trip';
    }
    return 'to trip';
  };

  const performDelete = async (keepItems: boolean) => {
    const movedItemIds: string[] = [];

    if (keepItems) {
      // First, move all contained items - they inherit the container's bag
      const contained =
        props.allItems?.filter((item) => item.container_item_id === props.item.id) || [];

      for (const item of contained) {
        await api.patch(endpoints.tripItems(props.tripId), {
          id: item.id,
          container_item_id: null,
          bag_id: props.item.bag_id || null, // Inherit bag from container
        });
        movedItemIds.push(item.id);
      }
    }

    // Then delete the container
    const response = await api.delete(endpoints.tripItems(props.tripId), {
      body: JSON.stringify({ id: props.item.id }),
    });

    if (response.success) {
      const destination = getContainerDestination();
      showToast(
        'success',
        keepItems
          ? `Container deleted. ${containedItemsCount()} items moved ${destination}.`
          : 'Item deleted'
      );
      setShowDeleteConfirm(false);
      // Call onDeleted if provided, otherwise fall back to onSaved for compatibility
      if (props.onDeleted) {
        props.onDeleted(props.item.id, keepItems ? movedItemIds : undefined);
      } else {
        props.onSaved();
      }
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
              <For each={sortedCategories()}>
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
              if (e.currentTarget.checked && location().startsWith('container:')) {
                setLocation(''); // Containers can't be inside containers
              }
            }}
            class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="is-container" class="text-sm font-medium text-gray-700">
            This is a container (sub-bag)
          </label>
        </div>

        {/* Combined Bag/Container location (only show if not a container itself) */}
        <Show when={!isContainer()}>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Inside Bag/Container</label>
            <select
              value={location()}
              onChange={(e) => setLocation(e.target.value)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No bag</option>
              <For each={bags()}>
                {(bag) => <option value={`bag:${bag.id}`}>{bag.name}</option>}
              </For>
              <Show when={availableContainers().length > 0}>
                <For each={availableContainers()}>
                  {(container) => (
                    <option value={`container:${container.id}`}>📦 {container.name}</option>
                  )}
                </For>
              </Show>
            </select>
          </div>
        </Show>

        {/* Notes field */}
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={notes()}
            onInput={(e) => setNotes(e.currentTarget.value)}
            placeholder="Optional notes about this item"
            rows="2"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>

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

      {/* Delete confirmation dialog for containers with items */}
      <Show when={showDeleteConfirm()}>
        <div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 class="mb-4 text-lg font-semibold text-gray-900">Delete Container?</h3>
            <p class="mb-6 text-sm text-gray-600">
              This container has {containedItemsCount()} item
              {containedItemsCount() !== 1 ? 's' : ''} inside. What would you like to do?
            </p>
            <div class="flex flex-col gap-3">
              <Button
                onClick={() => performDelete(true)}
                variant="primary"
                class="w-full justify-center"
              >
                Keep Items (move {getContainerDestination()})
              </Button>
              <Button
                onClick={() => performDelete(false)}
                variant="secondary"
                class="w-full justify-center bg-red-50 text-red-600 hover:bg-red-100"
              >
                Delete All ({containedItemsCount() + 1} items)
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                variant="secondary"
                class="w-full justify-center"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </Modal>
  );
}
