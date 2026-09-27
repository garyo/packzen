import { createSignal, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { TripItem, Bag, Category } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showToast } from '../ui/Toast';
import { TrashIcon } from '../ui/Icons';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import {
  CategoryPicker,
  categoryChoiceForName,
  choiceMayCreateCategory,
  resolveCategoryChoice,
  type CategoryChoice,
} from './CategoryPicker';

interface EditTripItemProps {
  tripId: string;
  item: TripItem;
  allItems: TripItem[] | undefined; // All trip items for container selection
  bags: Bag[] | undefined;
  categories: Category[] | undefined;
  /** Called after this form creates a category, so the parent can refresh its own copy. */
  onDataChanged: () => void;
  onClose: () => void;
  /** Called with the updated item, or with nothing when the parent should refetch. */
  onSaved: (updatedItem?: TripItem) => void;
  /** Delete the item (and any contents), offering Undo. */
  onDelete: () => void;
  /** A container was deleted here after its contents were moved out. */
  onDeleted: (deletedItemId: string, movedItemIds: string[]) => void;
}

const locationOf = (item: TripItem) =>
  item.container_item_id
    ? `container:${item.container_item_id}`
    : item.bag_id
      ? `bag:${item.bag_id}`
      : '';

export function EditTripItem(props: EditTripItemProps) {
  const [name, setName] = createSignal(props.item.name);
  const [quantity, setQuantity] = createSignal(props.item.quantity);
  const [notes, setNotes] = createSignal(props.item.notes || '');
  // Undefined until the user changes the category, so saving never touches a
  // category it didn't change (e.g. a starter item whose category has no record).
  const [categoryEdit, setCategoryEdit] = createSignal<CategoryChoice>();
  const [isContainer, setIsContainer] = createSignal(props.item.is_container || false);
  // Combined location - stores either "bag:id" or "container:id"
  const [location, setLocation] = createSignal<string>(locationOf(props.item));
  const [saving, setSaving] = createSignal(false);

  const bags = () => props.bags || [];
  const categoryChoice = () =>
    categoryEdit() ?? categoryChoiceForName(props.item.category_name, props.categories);

  const isDirty = () =>
    name() !== props.item.name ||
    quantity() !== props.item.quantity ||
    notes() !== (props.item.notes || '') ||
    categoryEdit() !== undefined ||
    isContainer() !== (props.item.is_container || false) ||
    location() !== locationOf(props.item);

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

  const handleSave = async () => {
    if (saving()) return;
    setSaving(true);

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
      setSaving(false);
      return;
    }

    let categoryName: string | null | undefined;
    const edit = categoryEdit();
    if (edit !== undefined) {
      const resolved = await resolveCategoryChoice(edit, [...(props.categories ?? [])]);
      if ('error' in resolved) {
        showToast('error', resolved.error);
        setSaving(false);
        return;
      }
      categoryName = resolved.category?.name ?? null;
      if (choiceMayCreateCategory(edit)) props.onDataChanged();
    }

    const patchData = {
      id: props.item.id,
      name: name().trim(),
      quantity: quantity(),
      notes: notes().trim() || null,
      bag_id: containerItemId ? null : bagId, // If inside a container, clear bag_id
      ...(categoryName !== undefined && { category_name: categoryName }),
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
      setSaving(false);
    }
  };

  const containedItems = () =>
    (props.allItems ?? []).filter((item) => item.container_item_id === props.item.id);
  const [choosingContainerDelete, setChoosingContainerDelete] = createSignal(false);

  // A plain delete needs no confirmation: the toast offers Undo instead.
  const deleteWithUndo = () => {
    props.onDelete();
    props.onClose();
  };

  const handleDelete = () => {
    if (containedItems().length > 0) setChoosingContainerDelete(true);
    else deleteWithUndo();
  };

  // The contents keep the container's own location, not any unsaved edit.
  const containerDestination = () =>
    bags().find((b) => b.id === props.item.bag_id)?.name ?? NO_BAG_LABEL;

  const deleteContainerKeepingContents = async () => {
    if (saving()) return;
    setSaving(true);
    const movedItemIds: string[] = [];

    for (const item of containedItems()) {
      const moveResponse = await api.patch(endpoints.tripItems(props.tripId), {
        id: item.id,
        container_item_id: null,
        bag_id: props.item.bag_id || null,
      });
      if (!moveResponse.success) {
        // Abort before deleting the container - otherwise the server-side cascade
        // would delete the children the user asked to keep. Some items may already
        // have been moved, so refresh from the server to stay in sync.
        showToast('error', moveResponse.error || 'Failed to move items out of container');
        props.onSaved();
        setSaving(false);
        return;
      }
      movedItemIds.push(item.id);
    }

    const response = await api.delete(endpoints.tripItems(props.tripId), {
      body: JSON.stringify({ id: props.item.id }),
    });
    if (response.success) {
      showToast(
        'success',
        `Container deleted. ${movedItemIds.length} items moved to ${containerDestination()}.`
      );
      props.onDeleted(props.item.id, movedItemIds);
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to delete item');
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Item" onClose={props.onClose} isDirty={isDirty}>
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
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity() - 1))}
              disabled={quantity() <= 1}
              class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <Input
              type="number"
              min="1"
              value={quantity()}
              onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
              class="w-20 text-center"
            />
            <button
              type="button"
              onClick={() => setQuantity(quantity() + 1)}
              class="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-semibold text-gray-700 hover:bg-gray-50"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <CategoryPicker
            categories={props.categories}
            value={categoryChoice()}
            onChange={setCategoryEdit}
          />
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

        {/* Bag/Container location selector */}
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            {isContainer() ? 'Inside Bag' : 'Inside Bag/Container'}
          </label>
          <select
            value={location()}
            onChange={(e) => setLocation(e.target.value)}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{NO_BAG_LABEL}</option>
            <For each={bags()}>{(bag) => <option value={`bag:${bag.id}`}>{bag.name}</option>}</For>
            <Show when={!isContainer() && availableContainers().length > 0}>
              <For each={availableContainers()}>
                {(container) => (
                  <option value={`container:${container.id}`}>📦 {container.name}</option>
                )}
              </For>
            </Show>
          </select>
        </div>

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
          <Button onClick={handleSave} class="flex-1" disabled={saving()}>
            Save
          </Button>
          <button
            onClick={handleDelete}
            disabled={saving()}
            class="p-2 text-gray-400 hover:text-red-600 disabled:opacity-50"
            title="Delete item"
          >
            <TrashIcon class="h-5 w-5" />
          </button>
        </div>
      </div>

      <Show when={choosingContainerDelete()}>
        <Modal
          title="Delete container?"
          size="small"
          onClose={() => setChoosingContainerDelete(false)}
        >
          <p class="mb-6 text-sm text-gray-600">
            "{props.item.name}" has {containedItems().length} item
            {containedItems().length !== 1 ? 's' : ''} inside. What would you like to do?
          </p>
          <div class="flex flex-col gap-3">
            <Button onClick={deleteContainerKeepingContents} disabled={saving()}>
              Keep items (move to {containerDestination()})
            </Button>
            <Button variant="danger" onClick={deleteWithUndo} disabled={saving()}>
              Delete all ({containedItems().length + 1} items)
            </Button>
            <Button
              variant="secondary"
              onClick={() => setChoosingContainerDelete(false)}
              disabled={saving()}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      </Show>
    </Modal>
  );
}
