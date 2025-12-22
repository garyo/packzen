/**
 * ItemsList Component
 *
 * Displays master items organized by category and uncategorized items
 * Extracted from AllItemsPage for better separation of concerns
 */

import { createSignal, createResource, createMemo, For, Show, type Accessor } from 'solid-js';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Combobox, type ComboboxItem } from '../ui/Combobox';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import { searchItems } from '../../lib/search';
import { builtInItems } from '../../lib/built-in-items';
import type { Category, MasterItemWithCategory } from '../../lib/types';

interface ItemsListProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onDeleteItem: (id: string) => void;
  onItemSaved?: () => void;
}

export function ItemsList(props: ItemsListProps) {
  // State for adding new items
  const [newName, setNewName] = createSignal('');
  const [newDescription, setNewDescription] = createSignal('');
  const [newCategoryId, setNewCategoryId] = createSignal('');
  const [newQuantity, setNewQuantity] = createSignal(1);
  const [newIsContainer, setNewIsContainer] = createSignal(false);
  const [adding, setAdding] = createSignal(false);

  // State for editing existing items
  const [editingItemId, setEditingItemId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal('');
  const [editDescription, setEditDescription] = createSignal('');
  const [editCategoryId, setEditCategoryId] = createSignal('');
  const [editQuantity, setEditQuantity] = createSignal(1);
  const [editIsContainer, setEditIsContainer] = createSignal(false);
  const [updating, setUpdating] = createSignal(false);

  // Search results for autocomplete - only search built-in templates
  const searchResults = createMemo(() => {
    const query = newName().trim();
    if (query.length < 2) return [];

    // Search built-in items only (not master items, since we're adding to that list)
    const builtInResults = searchItems(query, builtInItems.items);

    return builtInResults.slice(0, 8).map((item, idx) => ({
      id: `builtin-${idx}`,
      name: item.name,
      description: item.description,
      group: 'builtin' as const,
      categoryName: item.category,
      defaultQuantity: item.default_quantity,
      isContainer: false,
    }));
  });

  const handleItemSelect = (item: ComboboxItem) => {
    setNewName(item.name);
    setNewDescription(item.description || '');

    // Populate category
    if (item.categoryId) {
      setNewCategoryId(item.categoryId);
    } else if (item.categoryName) {
      const matchedCategory = props
        .categories()
        ?.find((cat) => cat.name.toLowerCase() === item.categoryName!.toLowerCase());
      setNewCategoryId(matchedCategory?.id || '');
    }

    // Populate quantity
    if (item.defaultQuantity) {
      setNewQuantity(item.defaultQuantity);
    }

    // Populate container flag
    if (item.isContainer !== undefined) {
      setNewIsContainer(item.isContainer);
    }
  };

  const handleAdd = async (e: Event) => {
    e.preventDefault();

    const itemName = newName().trim();
    if (!itemName) {
      showToast('error', 'Item name is required');
      return;
    }

    setAdding(true);

    const response = await api.post(endpoints.masterItems, {
      name: itemName,
      description: newDescription().trim() || null,
      category_id: newCategoryId() || null,
      default_quantity: newQuantity(),
      is_container: newIsContainer(),
    });

    setAdding(false);

    if (response.success) {
      showToast('success', 'Item added');
      setNewName('');
      setNewDescription('');
      setNewCategoryId('');
      setNewQuantity(1);
      setNewIsContainer(false);
      props.onItemSaved?.();
    } else {
      showToast('error', response.error || 'Failed to add item');
    }
  };

  const startEdit = (item: MasterItemWithCategory) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditDescription(item.description || '');
    setEditCategoryId(item.category_id || '');
    setEditQuantity(item.default_quantity);
    setEditIsContainer(item.is_container || false);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditName('');
    setEditDescription('');
    setEditCategoryId('');
    setEditQuantity(1);
    setEditIsContainer(false);
  };

  const handleUpdate = async (e: Event) => {
    e.preventDefault();

    if (!editName().trim()) {
      showToast('error', 'Name is required');
      return;
    }

    setUpdating(true);

    const response = await api.put(endpoints.masterItem(editingItemId()!), {
      name: editName().trim(),
      description: editDescription().trim() || null,
      category_id: editCategoryId() || null,
      default_quantity: editQuantity(),
      is_container: editIsContainer(),
    });

    setUpdating(false);

    if (response.success) {
      showToast('success', 'Item updated');
      cancelEdit();
      props.onItemSaved?.();
    } else {
      showToast('error', response.error || 'Failed to update item');
    }
  };

  // Pre-group and sort items by category for O(1) access
  const itemsByCategory = createMemo(() => {
    const items = props.items() || [];
    const grouped = new Map<string | null, MasterItem[]>();

    items.forEach((item) => {
      const categoryId = item.category_id || null;
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, []);
      }
      grouped.get(categoryId)!.push(item);
    });

    // Sort items within each category
    grouped.forEach((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  });

  const getItemsByCategory = (categoryId: string | null) => {
    return itemsByCategory().get(categoryId) || [];
  };

  const uncategorizedItems = () => getItemsByCategory(null);

  // Sort categories alphabetically by name
  const sortedCategories = createMemo(() => {
    const cats = props.categories() || [];
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  });

  return (
    <div class="space-y-6 md:space-y-3">
      {/* Add New Item Form */}
      <form onSubmit={handleAdd} class="rounded-lg bg-white p-4 shadow-md md:p-3">
        <h3 class="mb-3 text-sm font-medium text-gray-700">Add a new item to your master list:</h3>
        <div class="space-y-3">
          {/* Name, Category, and Quantity in a responsive flex row */}
          <div class="flex flex-wrap gap-3">
            <div class="min-w-[200px] flex-1 md:flex-[2]">
              <label class="mb-1 block text-sm font-medium text-gray-700">Item Name</label>
              <Combobox
                value={newName()}
                onInput={setNewName}
                items={searchResults()}
                onSelect={handleItemSelect}
                placeholder="Start typing to search..."
              />
            </div>

            <div class="min-w-[150px] flex-1 md:flex-[0.75]">
              <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <select
                value={newCategoryId()}
                onChange={(e) => setNewCategoryId(e.currentTarget.value)}
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">No category</option>
                <For each={sortedCategories()}>
                  {(cat) => (
                    <option value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  )}
                </For>
              </select>
            </div>

            <div class="w-20 md:w-24">
              <label class="mb-1 block text-sm font-medium text-gray-700">Qty</label>
              <input
                type="number"
                min="1"
                value={newQuantity()}
                onInput={(e) => setNewQuantity(parseInt(e.currentTarget.value) || 1)}
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              value={newDescription()}
              onInput={(e) => setNewDescription(e.currentTarget.value)}
              placeholder="Optional notes"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={2}
            />
          </div>

          {/* Container checkbox and Add button */}
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="new-is-container"
                checked={newIsContainer()}
                onChange={(e) => setNewIsContainer(e.currentTarget.checked)}
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label for="new-is-container" class="text-sm text-gray-700">
                Container
              </label>
            </div>
            <Button type="submit" size="sm" disabled={adding()}>
              {adding() ? 'Adding...' : 'Add Item'}
            </Button>
          </div>
        </div>
      </form>

      {/* Categories */}
      <For each={sortedCategories()}>
        {(category) => {
          const categoryItems = () => getItemsByCategory(category.id);
          return (
            <Show when={categoryItems().length > 0}>
              <CategorySection
                category={category}
                items={categoryItems()}
                editingItemId={editingItemId}
                onStartEdit={startEdit}
                onDeleteItem={props.onDeleteItem}
                onUpdate={handleUpdate}
                onCancelEdit={cancelEdit}
                editName={editName}
                setEditName={setEditName}
                editDescription={editDescription}
                setEditDescription={setEditDescription}
                editCategoryId={editCategoryId}
                setEditCategoryId={setEditCategoryId}
                editQuantity={editQuantity}
                setEditQuantity={setEditQuantity}
                editIsContainer={editIsContainer}
                setEditIsContainer={setEditIsContainer}
                updating={updating}
                categories={props.categories}
              />
            </Show>
          );
        }}
      </For>

      {/* Uncategorized */}
      <Show when={uncategorizedItems().length > 0}>
        <div class="rounded-lg bg-white p-4 shadow-sm md:p-2">
          <h2 class="mb-4 text-lg font-semibold text-gray-900 md:mb-2 md:text-base">
            Uncategorized ({uncategorizedItems().length})
          </h2>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2 lg:grid-cols-3">
            <For each={uncategorizedItems()}>
              {(item) => (
                <ItemCardWithEdit
                  item={item}
                  editingItemId={editingItemId}
                  onStartEdit={startEdit}
                  onDelete={() => props.onDeleteItem(item.id)}
                  onUpdate={handleUpdate}
                  onCancelEdit={cancelEdit}
                  editName={editName}
                  setEditName={setEditName}
                  editDescription={editDescription}
                  setEditDescription={setEditDescription}
                  editCategoryId={editCategoryId}
                  setEditCategoryId={setEditCategoryId}
                  editQuantity={editQuantity}
                  setEditQuantity={setEditQuantity}
                  editIsContainer={editIsContainer}
                  setEditIsContainer={setEditIsContainer}
                  updating={updating}
                  categories={props.categories}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

interface CategorySectionProps {
  category: Category;
  items: MasterItemWithCategory[];
  editingItemId: () => string | null;
  onStartEdit: (item: MasterItemWithCategory) => void;
  onDeleteItem: (id: string) => void;
  onUpdate: (e: Event) => void;
  onCancelEdit: () => void;
  editName: () => string;
  setEditName: (value: string) => void;
  editDescription: () => string;
  setEditDescription: (value: string) => void;
  editCategoryId: () => string;
  setEditCategoryId: (value: string) => void;
  editQuantity: () => number;
  setEditQuantity: (value: number) => void;
  editIsContainer: () => boolean;
  setEditIsContainer: (value: boolean) => void;
  updating: () => boolean;
  categories: Accessor<Category[] | undefined>;
}

function CategorySection(props: CategorySectionProps) {
  return (
    <div class="rounded-lg bg-white p-4 shadow-sm md:p-2">
      <div class="mb-4 flex items-center gap-2 md:mb-2">
        <span class="text-2xl md:text-xl">{props.category.icon || '📦'}</span>
        <h2 class="text-lg font-semibold text-gray-900 md:text-base">{props.category.name}</h2>
        <span class="text-sm text-gray-500 md:text-xs">({props.items.length})</span>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2 lg:grid-cols-3">
        <For each={props.items}>
          {(item) => (
            <ItemCardWithEdit
              item={item}
              editingItemId={props.editingItemId}
              onStartEdit={props.onStartEdit}
              onDelete={() => props.onDeleteItem(item.id)}
              onUpdate={props.onUpdate}
              onCancelEdit={props.onCancelEdit}
              editName={props.editName}
              setEditName={props.setEditName}
              editDescription={props.editDescription}
              setEditDescription={props.setEditDescription}
              editCategoryId={props.editCategoryId}
              setEditCategoryId={props.setEditCategoryId}
              editQuantity={props.editQuantity}
              setEditQuantity={props.setEditQuantity}
              editIsContainer={props.editIsContainer}
              setEditIsContainer={props.setEditIsContainer}
              updating={props.updating}
              categories={props.categories}
            />
          )}
        </For>
      </div>
    </div>
  );
}

interface ItemCardWithEditProps {
  item: MasterItemWithCategory;
  editingItemId: () => string | null;
  onStartEdit: (item: MasterItemWithCategory) => void;
  onDelete: () => void;
  onUpdate: (e: Event) => void;
  onCancelEdit: () => void;
  editName: () => string;
  setEditName: (value: string) => void;
  editDescription: () => string;
  setEditDescription: (value: string) => void;
  editCategoryId: () => string;
  setEditCategoryId: (value: string) => void;
  editQuantity: () => number;
  setEditQuantity: (value: number) => void;
  editIsContainer: () => boolean;
  setEditIsContainer: (value: boolean) => void;
  updating: () => boolean;
  categories: Accessor<Category[] | undefined>;
}

function ItemCardWithEdit(props: ItemCardWithEditProps) {
  return (
    <Show
      when={props.editingItemId() === props.item.id}
      fallback={
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 md:p-2">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="font-medium text-gray-900 md:text-sm">{props.item.name}</h3>
              {props.item.description && (
                <p class="mt-1 text-sm text-gray-600 md:mt-0.5 md:text-xs">
                  {props.item.description}
                </p>
              )}
              <p class="mt-1 text-xs text-gray-500 md:mt-0.5">Qty: {props.item.default_quantity}</p>
            </div>
            <div class="ml-2 flex gap-1">
              <button
                onClick={() => props.onStartEdit(props.item)}
                class="p-1 text-gray-400 hover:text-blue-600"
                aria-label="Edit"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={props.onDelete}
                class="p-1 text-gray-400 hover:text-red-600"
                aria-label="Delete"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        </div>
      }
    >
      <form
        onSubmit={props.onUpdate}
        class="col-span-full space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3"
      >
        <Input
          label="Item Name"
          type="text"
          value={props.editName()}
          onInput={(e) => props.setEditName(e.currentTarget.value)}
          required
        />

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <select
            value={props.editCategoryId()}
            onChange={(e) => props.setEditCategoryId(e.currentTarget.value)}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">No category</option>
            <For
              each={[...(props.categories() || [])].sort((a, b) => a.name.localeCompare(b.name))}
            >
              {(cat) => (
                <option value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              )}
            </For>
          </select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={props.editDescription()}
            onInput={(e) => props.setEditDescription(e.currentTarget.value)}
            placeholder="Optional notes"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={2}
          />
        </div>

        <Input
          label="Quantity"
          type="number"
          min="1"
          value={props.editQuantity()}
          onInput={(e) => props.setEditQuantity(parseInt(e.currentTarget.value) || 1)}
        />

        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id={`is-container-${props.item.id}`}
            checked={props.editIsContainer()}
            onChange={(e) => props.setEditIsContainer(e.currentTarget.checked)}
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for={`is-container-${props.item.id}`} class="text-sm text-gray-700">
            Container (sub-bag)
          </label>
        </div>

        <div class="flex gap-2">
          <Button type="submit" size="sm" disabled={props.updating()}>
            {props.updating() ? 'Saving...' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={props.onCancelEdit}>
            Cancel
          </Button>
        </div>
      </form>
    </Show>
  );
}
