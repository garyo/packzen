import { createSignal, createResource, createMemo, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Category, MasterItemWithCategory } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Combobox, type ComboboxItem } from '../ui/Combobox';
import { showToast } from '../ui/Toast';
import { searchItems } from '../../lib/search';
import { builtInItems } from '../../lib/built-in-items';

interface AddMasterItemFormProps {
  onClose: () => void;
  onSaved: () => void;
}

export function AddMasterItemForm(props: AddMasterItemFormProps) {
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [quantity, setQuantity] = createSignal(1);
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [isContainer, setIsContainer] = createSignal(false);
  const [isNewCategory, setIsNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const [categories, { refetch: refetchCategories }] = createResource<Category[]>(async () => {
    const response = await api.get<Category[]>(endpoints.categories);
    return response.success && response.data ? response.data : [];
  });

  const [masterItems] = createResource<MasterItemWithCategory[]>(async () => {
    const response = await api.get<MasterItemWithCategory[]>(endpoints.masterItems);
    return response.success && response.data ? response.data : [];
  });

  // Search results for autocomplete
  const searchResults = createMemo(() => {
    const query = name().trim();
    if (query.length < 2) return [];

    // Search master items
    const masterResults = searchItems(query, masterItems() || []);

    // Search built-in items
    const builtInResults = searchItems(query, builtInItems.items);

    // Prioritize: show top 5 master, fill remaining with built-in (max 8 total)
    const master = masterResults.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      group: 'master' as const,
      categoryId: item.category_id,
      categoryName: item.category_name,
      defaultQuantity: item.default_quantity,
      isContainer: item.is_container,
    }));

    const builtin = builtInResults.slice(0, 8 - master.length).map((item, idx) => ({
      id: `builtin-${idx}`,
      name: item.name,
      description: item.description,
      group: 'builtin' as const,
      categoryName: item.category,
      defaultQuantity: item.default_quantity,
      isContainer: false,
    }));

    return [...master, ...builtin];
  });

  const handleItemSelect = (item: ComboboxItem) => {
    setName(item.name);
    setDescription(item.description || '');

    // Populate category
    if (item.categoryId) {
      setCategoryId(item.categoryId);
    } else if (item.categoryName) {
      // Match built-in category name to user's categories (case-insensitive)
      const matchedCategory = categories()?.find(
        (cat) => cat.name.toLowerCase() === item.categoryName!.toLowerCase()
      );
      setCategoryId(matchedCategory?.id || null);
    }

    // Populate quantity
    if (item.defaultQuantity) {
      setQuantity(item.defaultQuantity);
    }

    // Populate container flag
    if (item.isContainer !== undefined) {
      setIsContainer(item.isContainer);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const itemName = name().trim();
    if (!itemName) {
      showToast('error', 'Item name is required');
      return;
    }

    setSaving(true);

    // Create new category if needed
    let finalCategoryId = categoryId();
    if (isNewCategory()) {
      const newCatName = newCategoryName().trim();
      if (!newCatName) {
        showToast('error', 'Category name is required');
        setSaving(false);
        return;
      }

      const catResponse = await api.post(endpoints.categories, { name: newCatName });
      if (catResponse.success && catResponse.data) {
        finalCategoryId = catResponse.data.id;
        await refetchCategories();
      } else {
        showToast('error', 'Failed to create category');
        setSaving(false);
        return;
      }
    }

    // Create master item
    const response = await api.post(endpoints.masterItems, {
      name: itemName,
      description: description().trim() || null,
      category_id: finalCategoryId,
      default_quantity: quantity(),
      is_container: isContainer(),
    });

    setSaving(false);

    if (response.success) {
      showToast('success', 'Item added');

      // Reset form
      setName('');
      setDescription('');
      setQuantity(1);
      setCategoryId(null);
      setIsContainer(false);
      setIsNewCategory(false);
      setNewCategoryName('');

      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to add item');
    }
  };

  return (
    <Modal title="Add Item" onClose={props.onClose}>
      <form onSubmit={handleSubmit} class="space-y-4">
        {/* Name with Autocomplete */}
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Item Name *</label>
          <Combobox
            value={name()}
            onInput={setName}
            items={searchResults()}
            onSelect={handleItemSelect}
            placeholder="Start typing to search..."
          />
        </div>

        {/* Category */}
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
                  placeholder="New category name"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsNewCategory(false);
                    setNewCategoryName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            }
          >
            <div class="flex gap-2">
              <select
                value={categoryId() || ''}
                onChange={(e) => setCategoryId(e.currentTarget.value || null)}
                class="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">No category</option>
                <For each={categories() || []}>
                  {(cat) => (
                    <option value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  )}
                </For>
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsNewCategory(true)}
              >
                + New
              </Button>
            </div>
          </Show>
        </div>

        {/* Description */}
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="Optional notes about this item"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={3}
          />
        </div>

        {/* Quantity */}
        <Input
          label="Default Quantity"
          type="number"
          min="1"
          value={quantity()}
          onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
        />

        {/* Container checkbox */}
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            id="is-container-master"
            checked={isContainer()}
            onChange={(e) => setIsContainer(e.currentTarget.checked)}
            class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="is-container-master" class="text-sm font-medium text-gray-700">
            This is a container (sub-bag like a toilet kit)
          </label>
        </div>

        {/* Actions */}
        <div class="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving()}>
            {saving() ? 'Saving...' : 'Add Item'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
