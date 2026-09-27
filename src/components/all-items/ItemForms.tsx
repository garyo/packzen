/**
 * Add and edit forms for My Items. Each form owns its own draft; the shared
 * detail fields (category, quantity, description, container) render from it.
 */

import { createMemo, createSignal, createUniqueId, For, Show, type Accessor } from 'solid-js';
import { createStore, type SetStoreFunction } from 'solid-js/store';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Combobox, type ComboboxItem } from '../ui/Combobox';
import { QuantityInput } from '../ui/QuantityInput';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import { searchItems } from '../../lib/search';
import { builtInItems } from '../../lib/built-in-items';
import { getOrCreateCategory } from '../../lib/item-helpers';
import type { BuiltInItem, Category, MasterItemWithCategory } from '../../lib/types';

// A Suggestion's category the user doesn't have yet: kept as `new:<name>` in
// the draft and created on save.
const NEW_CATEGORY = 'new:';

interface ItemDraft {
  name: string;
  description: string;
  category_id: string;
  quantity: number;
  is_container: boolean;
}

const emptyDraft = (): ItemDraft => ({
  name: '',
  description: '',
  category_id: '',
  quantity: 1,
  is_container: false,
});

const toPayload = (draft: ItemDraft) => ({
  name: draft.name.trim(),
  description: draft.description.trim() || null,
  category_id: draft.category_id || null,
  default_quantity: draft.quantity,
  is_container: draft.is_container,
});

const fieldClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none';

export function AddItemForm(props: {
  categories: Accessor<Category[]>;
  onAdded: (item: MasterItemWithCategory) => void;
}) {
  const [draft, setDraft] = createStore(emptyDraft());
  const [showMore, setShowMore] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const nameId = createUniqueId();

  const toSuggestion = (item: BuiltInItem, idx: number): ComboboxItem => ({
    id: `builtin-${idx}`,
    name: item.name,
    description: item.description,
    group: 'builtin',
    categoryName: item.category,
    defaultQuantity: item.default_quantity,
    isContainer: item.is_container ?? false,
  });

  // Autocomplete from Suggestions only: this form adds to My Items itself.
  const suggestions = createMemo((): ComboboxItem[] => {
    const query = draft.name.trim();
    if (query.length < 2) return [];
    return searchItems(query, builtInItems.items).slice(0, 8).map(toSuggestion);
  });

  const handleSelect = (item: ComboboxItem) => {
    const categoryName = item.categoryName?.toLowerCase();
    const category = props.categories().find((c) => c.name.toLowerCase() === categoryName);
    setDraft({
      name: item.name,
      description: item.description || '',
      category_id: category?.id ?? (item.categoryName ? NEW_CATEGORY + item.categoryName : ''),
      quantity: item.defaultQuantity ?? 1,
      is_container: item.isContainer ?? false,
    });
  };

  const handleAdd = async (e: Event) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      showToast('error', 'Item name is required');
      return;
    }

    // A name typed exactly like a Suggestion, without picking it, takes its
    // details unless the user already set some.
    const match = builtInItems.items.find(
      (item) => item.name.toLowerCase() === draft.name.trim().toLowerCase()
    );
    if (match && !draft.category_id && !draft.description.trim()) {
      handleSelect(toSuggestion(match, 0));
    }

    setAdding(true);
    let categoryId = draft.category_id;
    if (categoryId.startsWith(NEW_CATEGORY)) {
      const name = categoryId.slice(NEW_CATEGORY.length);
      categoryId = (await getOrCreateCategory(name, [...props.categories()]))?.id ?? '';
    }
    const payload = toPayload({ ...draft, category_id: categoryId });
    const response = await api.post<MasterItemWithCategory>(endpoints.masterItems, payload);
    setAdding(false);

    if (response.success && response.data) {
      showToast('success', `Added ${payload.name}`);
      setDraft(emptyDraft());
      props.onAdded(response.data);
    } else {
      showToast('error', response.error || 'Failed to add item');
    }
  };

  return (
    <form onSubmit={handleAdd} class="rounded-lg bg-white p-3 shadow-sm">
      <label for={nameId} class="mb-1 block text-sm font-medium text-gray-700">
        Add to My Items
      </label>
      <div class="flex gap-2">
        <Combobox
          id={nameId}
          value={draft.name}
          onInput={(value) => setDraft('name', value)}
          items={suggestions()}
          onSelect={handleSelect}
          placeholder="e.g. Toothbrush"
          class="min-w-0 flex-1"
        />
        <Button type="submit" disabled={adding()}>
          {adding() ? 'Adding…' : 'Add'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={showMore()}
          onClick={() => setShowMore(!showMore())}
        >
          {showMore() ? 'Less' : 'More'}
        </Button>
      </div>
      <Show when={showMore()}>
        <div class="mt-3">
          <ItemDetailsFields draft={draft} setDraft={setDraft} categories={props.categories} />
        </div>
      </Show>
    </form>
  );
}

export function ItemEditForm(props: {
  item: MasterItemWithCategory;
  categories: Accessor<Category[]>;
  onSaved: (item: MasterItemWithCategory) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = createStore<ItemDraft>({
    name: props.item.name,
    description: props.item.description || '',
    category_id: props.item.category_id || '',
    quantity: props.item.default_quantity,
    is_container: props.item.is_container || false,
  });
  const [saving, setSaving] = createSignal(false);

  const handleSave = async (e: Event) => {
    e.preventDefault();
    const payload = toPayload(draft);
    if (!payload.name) {
      showToast('error', 'Name is required');
      return;
    }

    setSaving(true);
    const response = await api.patch<MasterItemWithCategory>(
      endpoints.masterItem(props.item.id),
      payload
    );
    setSaving(false);

    if (response.success && response.data) {
      showToast('success', 'Item updated');
      props.onSaved(response.data);
    } else {
      showToast('error', response.error || 'Failed to update item');
    }
  };

  return (
    <form
      onSubmit={handleSave}
      class="col-span-full space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3"
    >
      <Input
        label="Item name"
        type="text"
        value={draft.name}
        onInput={(e) => setDraft('name', e.currentTarget.value)}
        required
      />
      <ItemDetailsFields draft={draft} setDraft={setDraft} categories={props.categories} />
      <div class="flex gap-2">
        <Button type="submit" size="sm" disabled={saving()}>
          {saving() ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ItemDetailsFields(props: {
  draft: ItemDraft;
  setDraft: SetStoreFunction<ItemDraft>;
  categories: Accessor<Category[]>;
}) {
  const id = createUniqueId();

  return (
    <div class="space-y-3">
      <div class="flex gap-3">
        <div class="min-w-0 flex-1">
          <label for={`${id}-category`} class="mb-1 block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id={`${id}-category`}
            value={props.draft.category_id}
            onChange={(e) => props.setDraft('category_id', e.currentTarget.value)}
            class={fieldClass}
          >
            <option value="">No category</option>
            <Show when={props.draft.category_id.startsWith(NEW_CATEGORY)}>
              <option value={props.draft.category_id}>
                {props.draft.category_id.slice(NEW_CATEGORY.length)} (new)
              </option>
            </Show>
            <For each={props.categories()}>
              {(cat) => (
                <option value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="w-24">
          <label for={`${id}-qty`} class="mb-1 block text-sm font-medium text-gray-700">
            Qty
          </label>
          <QuantityInput
            id={`${id}-qty`}
            value={props.draft.quantity}
            onChange={(n) => props.setDraft('quantity', n)}
            class="w-full px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label for={`${id}-description`} class="mb-1 block text-sm font-medium text-gray-700">
          Description (optional)
        </label>
        <textarea
          id={`${id}-description`}
          value={props.draft.description}
          onInput={(e) => props.setDraft('description', e.currentTarget.value)}
          class={fieldClass}
          rows={2}
        />
      </div>

      <label class="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={props.draft.is_container}
          onChange={(e) => props.setDraft('is_container', e.currentTarget.checked)}
          class="btn-compact h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        />
        Container (holds other items, like a toilet kit)
      </label>
    </div>
  );
}
