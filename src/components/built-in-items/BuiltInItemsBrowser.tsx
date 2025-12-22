/**
 * BuiltInItemsBrowser Component
 *
 * Modal for browsing and selecting built-in packing items
 * Supports filtering by trip type, category, and search
 * Users can select items and import them to master list or add to a trip
 */

import { createSignal, For, Show, createMemo, createResource } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { SelectedBuiltInItem, Bag, TripItem } from '../../lib/types';
import {
  builtInItems,
  getCategoryIcon,
  getItemsByTripTypes,
  getCategoriesForTripTypes,
} from '../../lib/built-in-items';
import { api, endpoints } from '../../lib/api';

interface BuiltInItemsBrowserProps {
  onClose: () => void;
  onImportToMaster?: (items: SelectedBuiltInItem[]) => Promise<void>;
  tripId?: string; // Optional: for "Add to Trip" workflow
  onAddToTrip?: (
    items: SelectedBuiltInItem[],
    bagId?: string | null,
    containerId?: string | null
  ) => Promise<void>;
}

export function BuiltInItemsBrowser(props: BuiltInItemsBrowserProps) {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedTripTypes, setSelectedTripTypes] = createSignal<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(null);
  const [selectedItems, setSelectedItems] = createSignal<Map<string, number>>(new Map());
  const [isImporting, setIsImporting] = createSignal(false);
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(new Set());
  const [selectedBag, setSelectedBag] = createSignal<string | null>(null);
  const [selectedContainer, setSelectedContainer] = createSignal<string | null>(null);
  const [keepOpen, setKeepOpen] = createSignal(false);

  // Load bags if adding to trip
  const [bags] = createResource<Bag[]>(
    () => props.tripId,
    async (tripId) => {
      const response = await api.get<Bag[]>(endpoints.tripBags(tripId));
      return response.success && response.data ? response.data : [];
    }
  );

  // Load trip items to get containers
  const [tripItems] = createResource<TripItem[]>(
    () => props.tripId,
    async (tripId) => {
      const response = await api.get<TripItem[]>(endpoints.tripItems(tripId));
      return response.success && response.data ? response.data : [];
    }
  );

  // Get available containers
  const availableContainers = () => {
    const items = tripItems() || [];
    return items.filter((item) => item.is_container);
  };

  // Filter items based on search, trip types, and category
  const filteredItems = createMemo(() => {
    let items = builtInItems.items;

    // Filter by trip types (intersection - item must have ALL selected types)
    const tripTypes = Array.from(selectedTripTypes());
    if (tripTypes.length > 0) {
      items = getItemsByTripTypes(tripTypes);
    }

    // Filter by category
    const category = selectedCategory();
    if (category) {
      items = items.filter((item) => item.category === category);
    }

    // Filter by search query
    const query = searchQuery().toLowerCase().trim();
    if (query) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query)
      );
    }

    return items;
  });

  // Group filtered items by category
  const groupedItems = createMemo(() => {
    const items = filteredItems();
    const groups = new Map<string, typeof items>();

    items.forEach((item) => {
      if (!groups.has(item.category)) {
        groups.set(item.category, []);
      }
      groups.get(item.category)!.push(item);
    });

    // Sort categories by sort_order and pre-sort items within each category
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const categoryA = builtInItems.categories.find((c) => c.name === a);
        const categoryB = builtInItems.categories.find((c) => c.name === b);
        return (categoryA?.sort_order || 999) - (categoryB?.sort_order || 999);
      })
      .map(
        ([category, categoryItems]) =>
          [category, categoryItems.sort((a, b) => a.name.localeCompare(b.name))] as [
            string,
            typeof items,
          ]
      );
  });

  // Get available categories for current filters
  const availableCategories = createMemo(() => {
    const tripTypes = Array.from(selectedTripTypes());
    return getCategoriesForTripTypes(tripTypes);
  });

  const toggleTripType = (tripTypeId: string) => {
    setSelectedTripTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tripTypeId)) {
        newSet.delete(tripTypeId);
      } else {
        newSet.add(tripTypeId);
      }
      return newSet;
    });
  };

  const toggleItemSelection = (itemName: string, defaultQuantity: number) => {
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(itemName)) {
        newMap.delete(itemName);
      } else {
        newMap.set(itemName, defaultQuantity);
      }
      return newMap;
    });
  };

  const toggleCategoryExpansion = (category: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const updateItemQuantity = (itemName: string, quantity: number) => {
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      newMap.set(itemName, Math.max(1, quantity));
      return newMap;
    });
  };

  const selectAllInCategory = (category: string) => {
    const categoryItems = filteredItems().filter((item) => item.category === category);
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      categoryItems.forEach((item) => {
        if (!newMap.has(item.name)) {
          newMap.set(item.name, item.default_quantity);
        }
      });
      return newMap;
    });
  };

  const deselectAllInCategory = (category: string) => {
    const categoryItems = filteredItems().filter((item) => item.category === category);
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      categoryItems.forEach((item) => {
        newMap.delete(item.name);
      });
      return newMap;
    });
  };

  const handleImport = async () => {
    if (selectedItems().size === 0) return;

    const items: SelectedBuiltInItem[] = Array.from(selectedItems().entries()).map(
      ([name, quantity]) => {
        const item = builtInItems.items.find((i) => i.name === name)!;
        return {
          name: item.name,
          description: item.description,
          category: item.category,
          quantity,
        };
      }
    );

    setIsImporting(true);

    try {
      if (props.onImportToMaster) {
        await props.onImportToMaster(items);
      } else if (props.onAddToTrip) {
        await props.onAddToTrip(items, selectedBag(), selectedContainer());
      }

      if (keepOpen()) {
        // Keep dialog open but reset selections for next batch
        setSelectedItems(new Map());
        setKeepOpen(false);
      } else {
        props.onClose();
      }
    } catch (error) {
      console.error('Failed to import items:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = () => selectedItems().size;

  return (
    <Modal title="Browse Item Templates" onClose={props.onClose} size="large">
      {/* Search & Category - side by side on larger screens */}
      <div class="mb-4 grid gap-4 md:grid-cols-2">
        <div>
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.target.value)}
            class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <select
            value={selectedCategory() || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            <For each={availableCategories()}>
              {(category) => <option value={category}>{category}</option>}
            </For>
          </select>
        </div>
      </div>

      {/* Trip Type Filter */}
      <div class="mb-4">
        <label class="mb-2 block text-sm font-medium text-gray-700">Trip Types:</label>
        <div class="flex flex-wrap gap-2">
          <For each={builtInItems.trip_types}>
            {(tripType) => {
              const isSelected = () => selectedTripTypes().has(tripType.id);
              return (
                <button
                  onClick={() => toggleTripType(tripType.id)}
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
      </div>

      {/* Container & Bag Selectors - side by side on larger screens (only show for trip workflow) */}
      <Show when={props.onAddToTrip}>
        <div class="mb-4 grid gap-4 md:grid-cols-2">
          {/* Container Selector */}
          <Show when={availableContainers().length > 0}>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Container:</label>
              <select
                value={selectedContainer() || ''}
                onChange={(e) => {
                  setSelectedContainer(e.target.value || null);
                  if (e.target.value) {
                    setSelectedBag(null); // Clear bag if selecting container
                  }
                }}
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No container</option>
                <For each={availableContainers()}>
                  {(container) => <option value={container.id}>📦 {container.name}</option>}
                </For>
              </select>
            </div>
          </Show>

          {/* Bag Selector (only show if not using container) */}
          <Show when={!selectedContainer()}>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Bag:</label>
              <select
                value={selectedBag() || ''}
                onChange={(e) => setSelectedBag(e.target.value || null)}
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No bag</option>
                <For each={bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
              </select>
            </div>
          </Show>
        </div>
      </Show>

      {/* Selected Count */}
      <div class="mb-4 text-sm font-medium text-gray-700">Selected: {selectedCount()} items</div>

      {/* Items List */}
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
              const categoryIcon = getCategoryIcon(category);
              const isExpanded = () => expandedCategories().has(category);
              const allSelected = () =>
                categoryItems.every((item) => selectedItems().has(item.name));
              const someSelected = () =>
                categoryItems.some((item) => selectedItems().has(item.name));

              return (
                <div class="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                  <div class="mb-2 flex items-center justify-between">
                    <button
                      onClick={() => toggleCategoryExpansion(category)}
                      class="flex flex-1 items-center gap-2 text-left font-semibold text-gray-900 hover:text-gray-700"
                    >
                      <svg
                        class={`h-5 w-5 transition-transform ${isExpanded() ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <span class="text-lg">{categoryIcon}</span>
                      {category}
                      <span class="text-sm font-normal text-gray-500">
                        ({categoryItems.length})
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant={allSelected() ? 'secondary' : 'ghost'}
                      onClick={() =>
                        allSelected() || someSelected()
                          ? deselectAllInCategory(category)
                          : selectAllInCategory(category)
                      }
                    >
                      {allSelected() || someSelected() ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <Show when={isExpanded()}>
                    <div class="space-y-2">
                      <For each={categoryItems}>
                        {(item) => {
                          const isSelected = () => selectedItems().has(item.name);
                          const quantity = () =>
                            selectedItems().get(item.name) || item.default_quantity;

                          return (
                            <div class="flex items-start gap-3 rounded p-2 hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={isSelected()}
                                onChange={() =>
                                  toggleItemSelection(item.name, item.default_quantity)
                                }
                                class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div class="flex-1">
                                <p class="font-medium text-gray-900">{item.name}</p>
                                {item.description && (
                                  <p class="text-sm text-gray-600">{item.description}</p>
                                )}
                              </div>
                              <Show when={isSelected()}>
                                <input
                                  type="number"
                                  min="1"
                                  value={quantity()}
                                  onInput={(e) =>
                                    updateItemQuantity(item.name, parseInt(e.target.value) || 1)
                                  }
                                  class="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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

      {/* Actions */}
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={props.onClose} disabled={isImporting()}>
          Cancel
        </Button>
        <Show when={props.onImportToMaster}>
          <Button onClick={handleImport} disabled={selectedCount() === 0 || isImporting()}>
            {isImporting() ? 'Adding...' : `Add to My Items (${selectedCount()})`}
          </Button>
        </Show>
        <Show when={props.onAddToTrip}>
          <Button
            variant="secondary"
            onClick={() => {
              setKeepOpen(true);
              handleImport();
            }}
            disabled={selectedCount() === 0 || isImporting()}
          >
            Add & Continue
          </Button>
          <Button onClick={handleImport} disabled={selectedCount() === 0 || isImporting()}>
            {isImporting() ? 'Adding...' : `Add to Trip (${selectedCount()})`}
          </Button>
        </Show>
      </div>
    </Modal>
  );
}
