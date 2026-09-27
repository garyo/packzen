/**
 * BuiltInItemsBrowser Component
 *
 * Modal for browsing Suggestions (the built-in packing items) and adding a
 * selection to My Items. Filters by trip type, category, and search.
 */

import { createSignal, For, Show, createMemo } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { QuantityInput } from '../ui/QuantityInput';
import { ChevronRightIcon } from '../ui/Icons';
import type { BuiltInItem, SelectedBuiltInItem } from '../../lib/types';
import { builtInItems, getCategoryIcon, getItemsByTripTypes } from '../../lib/built-in-items';

interface BuiltInItemsBrowserProps {
  onClose: () => void;
  onImportToMaster: (items: SelectedBuiltInItem[]) => Promise<void>;
}

// Built-in items aren't uniquely identified by name alone (the same name can
// appear under multiple categories), so selection state is keyed by the pair.
const itemKey = (item: { category: string; name: string }) => `${item.category}::${item.name}`;

const categoryOrder = (name: string) =>
  builtInItems.categories.find((c) => c.name === name)?.sort_order ?? 999;

export function BuiltInItemsBrowser(props: BuiltInItemsBrowserProps) {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedTripTypes, setSelectedTripTypes] = createSignal<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(null);
  const [selectedItems, setSelectedItems] = createSignal<Map<string, number>>(new Map());
  const [isImporting, setIsImporting] = createSignal(false);
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(new Set());

  // Items for any of the selected trip types (none selected = all items).
  const tripTypeItems = createMemo(() => getItemsByTripTypes(selectedTripTypes()));

  const availableCategories = createMemo(() =>
    [...new Set(tripTypeItems().map((item) => item.category))].sort(
      (a, b) => categoryOrder(a) - categoryOrder(b)
    )
  );

  // A category picked earlier stops applying once the trip types exclude it.
  const activeCategory = () => {
    const category = selectedCategory();
    return category && availableCategories().includes(category) ? category : null;
  };

  const query = () => searchQuery().toLowerCase().trim();

  const filteredItems = createMemo(() => {
    const category = activeCategory();
    const q = query();
    return tripTypeItems().filter(
      (item) =>
        (!category || item.category === category) &&
        (!q || item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q))
    );
  });

  const groupedItems = createMemo(() => {
    const groups = new Map<string, BuiltInItem[]>();
    for (const item of filteredItems()) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b))
      .map(
        ([category, items]) =>
          [category, items.sort((a, b) => a.name.localeCompare(b.name))] as const
      );
  });

  const toggleInSet = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };

  const toggleItemSelection = (item: BuiltInItem) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const key = itemKey(item);
      if (!next.delete(key)) next.set(key, item.default_quantity);
      return next;
    });
  };

  const setItemQuantity = (key: string, quantity: number) => {
    setSelectedItems((prev) => new Map(prev).set(key, quantity));
  };

  const setCategorySelected = (items: readonly BuiltInItem[], selected: boolean) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        const key = itemKey(item);
        if (!selected) next.delete(key);
        else if (!next.has(key)) next.set(key, item.default_quantity);
      }
      return next;
    });
  };

  const handleImport = async () => {
    const items: SelectedBuiltInItem[] = [...selectedItems().entries()].map(([key, quantity]) => {
      const item = builtInItems.items.find((i) => itemKey(i) === key)!;
      return {
        name: item.name,
        description: item.description,
        category: item.category,
        quantity,
        is_container: item.is_container,
      };
    });
    if (items.length === 0) return;

    setIsImporting(true);
    try {
      await props.onImportToMaster(items);
      props.onClose();
    } catch (error) {
      console.error('Failed to import items:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = () => selectedItems().size;

  return (
    <Modal title="Browse Suggestions" onClose={props.onClose} size="large">
      <div class="mb-4 grid gap-4 md:grid-cols-2">
        <input
          type="search"
          placeholder="Search suggestions..."
          aria-label="Search suggestions"
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        />
        <select
          aria-label="Category"
          value={activeCategory() ?? ''}
          onChange={(e) => setSelectedCategory(e.currentTarget.value || null)}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          <For each={availableCategories()}>
            {(category) => <option value={category}>{category}</option>}
          </For>
        </select>
      </div>

      <fieldset class="mb-4">
        <legend class="mb-2 block text-sm font-medium text-gray-700">Trip types</legend>
        <div class="flex flex-wrap gap-2">
          <For each={builtInItems.trip_types}>
            {(tripType) => {
              const isSelected = () => selectedTripTypes().has(tripType.id);
              return (
                <button
                  type="button"
                  aria-pressed={isSelected()}
                  onClick={() => setSelectedTripTypes((prev) => toggleInSet(prev, tripType.id))}
                  class={`rounded-full px-3 py-1 text-sm transition-colors ${
                    isSelected()
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  title={tripType.description}
                >
                  {tripType.name}
                </button>
              );
            }}
          </For>
        </div>
      </fieldset>

      <div class="mb-4 text-sm font-medium text-gray-700">Selected: {selectedCount()} items</div>

      <div class="max-h-96 space-y-4 overflow-y-auto border-t border-gray-200 pt-4">
        <Show
          when={groupedItems().length > 0}
          fallback={
            <div class="py-8 text-center text-gray-500">
              <p>No items found</p>
              <p class="mt-2 text-sm">Try adjusting your filters or search query</p>
            </div>
          }
        >
          <For each={groupedItems()}>
            {([category, categoryItems]) => {
              // Searching shows every match without extra taps.
              const isExpanded = () => !!query() || expandedCategories().has(category);
              const anySelected = () =>
                categoryItems.some((item) => selectedItems().has(itemKey(item)));

              return (
                <div class="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                  <div class="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      aria-expanded={isExpanded()}
                      onClick={() => setExpandedCategories((prev) => toggleInSet(prev, category))}
                      class="flex flex-1 items-center gap-2 text-left font-semibold text-gray-900 hover:text-gray-700"
                    >
                      <ChevronRightIcon
                        class={`h-5 w-5 transition-transform ${isExpanded() ? 'rotate-90' : ''}`}
                      />
                      <span class="text-lg">{getCategoryIcon(category)}</span>
                      {category}
                      <span class="text-sm font-normal text-gray-500">
                        ({categoryItems.length})
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant={anySelected() ? 'secondary' : 'ghost'}
                      onClick={() => setCategorySelected(categoryItems, !anySelected())}
                    >
                      {anySelected() ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <Show when={isExpanded()}>
                    <div class="space-y-1">
                      <For each={categoryItems}>
                        {(item) => {
                          const key = itemKey(item);
                          const isSelected = () => selectedItems().has(key);
                          return (
                            <div class="flex items-start gap-3 rounded hover:bg-gray-50">
                              <label class="flex flex-1 cursor-pointer items-start gap-3 p-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected()}
                                  onChange={() => toggleItemSelection(item)}
                                  class="btn-compact mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="flex-1">
                                  <span class="block font-medium text-gray-900">
                                    {item.is_container && (
                                      <span class="mr-1 text-xs" title="Container">
                                        📦
                                      </span>
                                    )}
                                    {item.name}
                                  </span>
                                  {item.description && (
                                    <span class="block text-sm text-gray-600">
                                      {item.description}
                                    </span>
                                  )}
                                </span>
                              </label>
                              <Show when={isSelected()}>
                                <QuantityInput
                                  value={selectedItems().get(key) ?? item.default_quantity}
                                  onChange={(n) => setItemQuantity(key, n)}
                                  aria-label={`Quantity of ${item.name}`}
                                  class="mt-1 w-16 px-2 py-1 text-center text-sm"
                                />
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={props.onClose} disabled={isImporting()}>
          Cancel
        </Button>
        <Button onClick={handleImport} disabled={selectedCount() === 0 || isImporting()}>
          {isImporting() ? 'Adding...' : `Add to My Items (${selectedCount()})`}
        </Button>
      </div>
    </Modal>
  );
}
