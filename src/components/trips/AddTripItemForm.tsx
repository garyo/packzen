import { createSignal, createResource, createEffect, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Bag, Category, MasterItemWithCategory, TripItem } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showToast } from '../ui/Toast';

interface AddTripItemFormProps {
  tripId: string;
  preSelectedBagId?: string | null;
  preSelectedContainerId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTripItemForm(props: AddTripItemFormProps) {
  const [name, setName] = createSignal('');
  const [quantity, setQuantity] = createSignal(1);
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [bagId, setBagId] = createSignal<string | null>(null);
  const [containerItemId, setContainerItemId] = createSignal<string | null>(null);
  const [keepOpen, setKeepOpen] = createSignal(false);
  const [isNewCategory, setIsNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal('');
  const [isContainer, setIsContainer] = createSignal(false);

  // Set pre-selected values from props using createEffect for proper reactivity
  // Wait for resources to load before setting to ensure dropdown options exist
  createEffect(() => {
    if (bags() && props.preSelectedBagId) {
      setBagId(props.preSelectedBagId);
    }
    if (tripItems() && props.preSelectedContainerId) {
      setContainerItemId(props.preSelectedContainerId);
    }
  });

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

  const [tripItems, { refetch: refetchTripItems }] = createResource<TripItem[]>(async () => {
    const response = await api.get<TripItem[]>(endpoints.tripItems(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  // Get available containers
  const availableContainers = () => {
    const items = tripItems() || [];
    return items.filter((item) => item.is_container);
  };

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
        finalCategoryId = (createCategoryResponse.data as { id: string }).id;
        setCategoryId(finalCategoryId);
        await refetchCategories();
        showToast('success', `Created category "${newCatName}"`);
      } else {
        showToast('error', 'Failed to create category');
        return;
      }
    }

    // Check if item exists in master list
    const masterItemsResponse = await api.get<MasterItemWithCategory[]>(endpoints.masterItems);
    const existingMasterItem = masterItemsResponse.data?.find(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    let masterItemId = existingMasterItem?.id;
    let categoryName: string | null | undefined;

    // If not in master list, add it
    if (!existingMasterItem) {
      const createMasterResponse = await api.post<MasterItemWithCategory>(endpoints.masterItems, {
        name: itemName,
        category_id: finalCategoryId,
        default_quantity: quantity(),
        is_container: isContainer(),
      });
      if (createMasterResponse.success && createMasterResponse.data) {
        masterItemId = createMasterResponse.data.id;
        categoryName = createMasterResponse.data.category_name;
        showToast('success', `Added "${itemName}" to all items`);
      }
    } else {
      categoryName = existingMasterItem.category_name;
    }

    // Validate: containers cannot be inside other containers
    if (isContainer() && containerItemId()) {
      showToast('error', 'Containers cannot be placed inside other containers');
      return;
    }

    // Add to trip
    const response = await api.post(endpoints.tripItems(props.tripId), {
      name: itemName,
      category_name: categoryName,
      quantity: quantity(),
      bag_id: bagId(), // Always use the selected bag
      master_item_id: masterItemId,
      is_container: isContainer(),
      container_item_id: containerItemId(),
    });

    if (response.success) {
      showToast('success', 'Item added to trip');

      if (keepOpen()) {
        // Smart reuse logic for Add Another
        const wasContainer = isContainer();
        const lastBagId = bagId();
        const lastCategoryId = categoryId();

        // Reset name and new category fields (but NOT category/bag/container)
        setName('');
        setIsNewCategory(false);
        setNewCategoryName('');
        setKeepOpen(false);
        setIsContainer(false); // Always uncheck container for next item

        // Call onSaved to trigger refetch (important for containers to appear in list)
        props.onSaved();

        if (wasContainer && response.data) {
          // If we just created a container, pre-select it as the container for the next item
          // Refetch trip items so the new container appears in the dropdown
          await refetchTripItems();

          // Wait for the UI to update with new container
          const newContainerId = (response.data as { id: string }).id;
          setTimeout(() => {
            setContainerItemId(newContainerId);
            // Category and bag should already be set from before, but restore them explicitly
            // to ensure they're not lost during refetch
            setCategoryId(lastCategoryId);
            setBagId(lastBagId);
          }, 250);
        }
        // Focus back on name input
        setTimeout(() => {
          document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
        }, 0);
      } else {
        props.onClose();
        props.onSaved();
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

        {/* Container assignment (only show if not a container itself and there are containers) */}
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

        {/* Bag selector - hidden when item is in a container (bag is inherited) */}
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

        {/* Container checkbox */}
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            id="is-container-add"
            checked={isContainer()}
            onChange={(e) => {
              setIsContainer(e.currentTarget.checked);
              if (e.currentTarget.checked) {
                setContainerItemId(null); // Containers can't be inside containers
              }
            }}
            class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="is-container-add" class="text-sm font-medium text-gray-700">
            This is a container (sub-bag like a toilet kit)
          </label>
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
