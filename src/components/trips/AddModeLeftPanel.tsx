/**
 * AddModeLeftPanel Component
 *
 * Left panel with tabs for item sources (My Items, Built-in)
 * Items are draggable to bag cards in the right panel
 */

import { createSignal, Show, For, createMemo, createEffect, type Accessor } from 'solid-js';
import { createDraggable } from '@thisbeyond/solid-dnd';
import type { TripItem, Category, MasterItemWithCategory } from '../../lib/types';
import {
  builtInItems,
  getItemsByTripTypes,
  getCategoriesForTripTypes,
} from '../../lib/built-in-items';
import type { SourceItemDragData, SelectedTarget } from './AddModeView';
import { TrashIcon, PlusIcon } from '../ui/Icons';

interface AddModeLeftPanelProps {
  activeTab: Accessor<'my-items' | 'built-in'>;
  onTabChange: (tab: 'my-items' | 'built-in') => void;
  items: Accessor<TripItem[] | undefined>;
  masterItems: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onRemoveFromTrip?: (tripItemId: string) => void;
  onAddNewItem?: () => void;
  isDragging?: Accessor<boolean>;
  // For click-to-add (bag or container selection)
  selectedTarget?: Accessor<SelectedTarget | undefined>;
  onAddToSelectedBag?: (dragData: SourceItemDragData) => void;
}

interface DraggableItemProps {
  id: string;
  name: string;
  category: string;
  quantity?: number;
  description?: string | null;
  isInTrip: boolean;
  isPacked?: boolean;
  tripItemId?: string; // ID of the trip item (for removal)
  dragData: SourceItemDragData;
  onRemove?: (tripItemId: string) => void;
  // For click-to-add
  canClickToAdd?: boolean;
  onClickAdd?: () => void;
}

function DraggableSourceItem(props: DraggableItemProps) {
  const draggable = createDraggable(props.id, props.dragData);

  return (
    <div
      ref={draggable.ref}
      class="flex items-center gap-1 rounded-md px-0 py-1.5 transition-colors md:gap-2 md:px-3 md:py-2"
      classList={{
        'opacity-50': props.isInTrip,
        'hover:bg-gray-50': !props.isInTrip,
        'bg-blue-50': draggable.isActiveDraggable,
      }}
    >
      {/* Drag handle or remove button */}
      <Show
        when={!props.isInTrip}
        fallback={
          props.onRemove && props.tripItemId ? (
            <div
              role="button"
              tabindex="0"
              class="flex h-5 w-7 cursor-pointer items-center justify-center rounded text-gray-400 hover:bg-red-100 hover:text-red-600"
              onClick={() => props.onRemove!(props.tripItemId!)}
              onKeyDown={(e) => e.key === 'Enter' && props.onRemove!(props.tripItemId!)}
              title="Remove from trip"
            >
              <TrashIcon class="h-4 w-4" />
            </div>
          ) : (
            <div class="h-6 w-6" /> // Spacer when no remove handler
          )
        }
      >
        {/* Drag handle - only this area triggers drag on touch */}
        <div
          class="flex cursor-grab flex-col gap-0.5 p-1 pl-2 text-gray-400"
          style={{ 'touch-action': 'none' }}
          {...draggable.dragActivators}
        >
          <div class="flex gap-0.5">
            <span class="h-1 w-1 rounded-full bg-current" />
            <span class="h-1 w-1 rounded-full bg-current" />
          </div>
          <div class="flex gap-0.5">
            <span class="h-1 w-1 rounded-full bg-current" />
            <span class="h-1 w-1 rounded-full bg-current" />
          </div>
          <div class="flex gap-0.5">
            <span class="h-1 w-1 rounded-full bg-current" />
            <span class="h-1 w-1 rounded-full bg-current" />
          </div>
        </div>
      </Show>

      {/* Item info */}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-medium text-gray-900">{props.name}</span>
          {props.quantity && props.quantity > 1 && (
            <span class="text-xs text-gray-500">x{props.quantity}</span>
          )}
        </div>
        {props.description && <p class="truncate text-xs text-gray-500">{props.description}</p>}
      </div>

      {/* Status indicator */}
      {props.isInTrip && (
        <span
          class={`flex-shrink-0 ${props.isPacked ? 'text-green-600' : 'text-gray-400'}`}
          title={props.isPacked ? 'Packed' : 'Added'}
        >
          {props.isPacked ? '✓' : '☐'}
        </span>
      )}

      {/* Click-to-add button - shown when bag is selected and item not in trip */}
      <Show when={props.canClickToAdd && !props.isInTrip}>
        <button
          type="button"
          class="ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600"
          onClick={(e) => {
            e.stopPropagation();
            props.onClickAdd?.();
          }}
          title="Add to selected bag"
        >
          <PlusIcon class="h-4 w-4" />
        </button>
      </Show>
    </div>
  );
}

export function AddModeLeftPanel(props: AddModeLeftPanelProps) {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedTripTypes, setSelectedTripTypes] = createSignal<Set<string>>(new Set());
  // Track manually collapsed categories (all categories start expanded)
  const [manuallyCollapsed, setManuallyCollapsed] = createSignal<Set<string>>(new Set());

  // Get set of master item IDs already in trip
  const tripMasterItemIds = createMemo(() => {
    const items = props.items() || [];
    const ids = new Set<string>();
    items.forEach((item) => {
      if (item.master_item_id) {
        ids.add(item.master_item_id);
      }
    });
    return ids;
  });

  // Get set of item names already in trip (for matching by name)
  const tripItemNames = createMemo(() => {
    const items = props.items() || [];
    return new Set(items.map((item) => item.name.toLowerCase()));
  });

  // Check if an item is already in trip
  // For master items: check by master_item_id first, then fallback to name match
  // For built-in items: check by name
  const isItemInTrip = (itemId: string, itemName: string, sourceType: 'master' | 'built-in') => {
    // First check by master_item_id if provided
    if (sourceType === 'master' && itemId && tripMasterItemIds().has(itemId)) {
      return true;
    }
    // Fallback: check by name (handles items added without master_item_id link)
    return tripItemNames().has(itemName.toLowerCase());
  };

  // Get packed status for an item
  const isItemPacked = (itemId: string, itemName: string, sourceType: 'master' | 'built-in') => {
    const items = props.items() || [];
    if (sourceType === 'master') {
      const tripItem = items.find((i) => i.master_item_id === itemId);
      return tripItem?.is_packed ?? false;
    } else {
      const tripItem = items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
      return tripItem?.is_packed ?? false;
    }
  };

  // Get the trip item ID for an item (to enable removal)
  // Check by master_item_id first, then fall back to name matching
  const getTripItemId = (itemId: string, itemName: string, sourceType: 'master' | 'built-in') => {
    const items = props.items() || [];
    if (sourceType === 'master' && itemId) {
      // First try by master_item_id
      const tripItemById = items.find((i) => i.master_item_id === itemId);
      if (tripItemById) return tripItemById.id;
    }
    // Fallback: find by name (handles items added without master_item_id link)
    const tripItemByName = items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
    return tripItemByName?.id;
  };

  // Group master items by category
  const groupedMasterItems = createMemo(() => {
    const masterItems = props.masterItems() || [];
    const query = searchQuery().toLowerCase().trim();

    // Filter by search
    const filtered = query
      ? masterItems.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.description?.toLowerCase().includes(query)
        )
      : masterItems;

    // Group by category
    const groups = new Map<string, MasterItemWithCategory[]>();
    filtered.forEach((item) => {
      const category = item.category_name || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    });

    // Sort categories alphabetically
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  // Built-in items filtered
  const filteredBuiltInItems = createMemo(() => {
    let items = builtInItems.items;

    // Filter by trip types
    const tripTypes = Array.from(selectedTripTypes());
    if (tripTypes.length > 0) {
      items = getItemsByTripTypes(tripTypes);
    }

    // Filter by search
    const query = searchQuery().toLowerCase().trim();
    if (query) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query)
      );
    }

    // Group by category
    const groups = new Map<string, typeof items>();
    items.forEach((item) => {
      const category = item.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    });

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  const toggleCategory = (category: string) => {
    setManuallyCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Category is expanded if:
  // - It's not manually collapsed, OR
  // - There's an active search (override manual collapse to show results)
  const isCategoryExpanded = (category: string) => {
    const isSearching = searchQuery().trim().length > 0;
    if (isSearching) {
      // When searching, always show categories with results
      return true;
    }
    // Not searching - respect manual collapse state (default is expanded)
    return !manuallyCollapsed().has(category);
  };

  // Trip types from built-in-items.yaml
  const tripTypes = [
    { id: 'overnight', label: 'Overnight' },
    { id: 'weekend', label: 'Weekend' },
    { id: 'week', label: 'Week-Long' },
    { id: 'business', label: 'Business' },
    { id: 'beach', label: 'Beach' },
    { id: 'hiking', label: 'Hiking' },
    { id: 'ski', label: 'Ski' },
    { id: 'international', label: 'International' },
  ];

  const toggleTripType = (type: string) => {
    setSelectedTripTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div class="flex h-full flex-col">
      {/* Tabs */}
      <div class="flex border-b border-gray-200">
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          classList={{
            'text-blue-600 border-b-2 border-blue-600 bg-blue-50': props.activeTab() === 'my-items',
            'text-gray-600 hover:text-gray-900 hover:bg-gray-50': props.activeTab() !== 'my-items',
          }}
          onClick={() => props.onTabChange('my-items')}
        >
          My Items
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          classList={{
            'text-blue-600 border-b-2 border-blue-600 bg-blue-50': props.activeTab() === 'built-in',
            'text-gray-600 hover:text-gray-900 hover:bg-gray-50': props.activeTab() !== 'built-in',
          }}
          onClick={() => props.onTabChange('built-in')}
        >
          Built-in
        </button>
      </div>

      {/* Search + Add button */}
      <div class="flex gap-1.5 border-b border-gray-200 p-2 md:gap-2 md:p-3">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          class="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none md:px-3 md:py-2"
        />
        <Show when={props.onAddNewItem}>
          <button
            type="button"
            onClick={props.onAddNewItem}
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 md:h-9 md:w-9"
            title="Add new item"
          >
            <PlusIcon class="h-4 w-4 md:h-5 md:w-5" />
          </button>
        </Show>
      </div>

      {/* Trip Type Filters (built-in tab only) */}
      <Show when={props.activeTab() === 'built-in'}>
        <div class="flex flex-wrap gap-1 border-b border-gray-200 p-2 md:p-3">
          <For each={tripTypes}>
            {(type) => (
              <button
                class="rounded-full px-2 py-1 text-xs transition-colors"
                classList={{
                  'bg-blue-100 text-blue-700': selectedTripTypes().has(type.id),
                  'bg-gray-100 text-gray-600 hover:bg-gray-200': !selectedTripTypes().has(type.id),
                }}
                onClick={() => toggleTripType(type.id)}
              >
                {type.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Item List - disable scroll during drag to prevent unwanted auto-scroll */}
      <div
        class="flex-1 p-1 md:p-2"
        classList={{
          'overflow-y-auto': !props.isDragging?.(),
          'overflow-hidden': props.isDragging?.(),
        }}
      >
        <Show when={props.activeTab() === 'my-items'}>
          <Show
            when={groupedMasterItems().length > 0}
            fallback={
              <div class="py-8 text-center text-gray-500">
                <p>No items in My Items list</p>
                <p class="mt-1 text-sm">Add items on the All Items page first</p>
              </div>
            }
          >
            <For each={groupedMasterItems()}>
              {([category, items]) => (
                <div class="mb-2">
                  <button
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={() => toggleCategory(category)}
                  >
                    <span
                      class="transition-transform"
                      classList={{ 'rotate-90': isCategoryExpanded(category) }}
                    >
                      ▶
                    </span>
                    {category}
                    <span class="text-xs font-normal text-gray-500">({items.length})</span>
                  </button>
                  <Show when={isCategoryExpanded(category)}>
                    <div class="ml-1">
                      <For each={items}>
                        {(item) => {
                          const dragData: SourceItemDragData = {
                            type: 'source-item',
                            sourceType: 'master',
                            masterItem: item,
                          };
                          return (
                            <DraggableSourceItem
                              id={`master-${item.id}`}
                              name={item.name}
                              category={item.category_name || 'Uncategorized'}
                              quantity={item.default_quantity}
                              description={item.description}
                              isInTrip={isItemInTrip(item.id, item.name, 'master')}
                              isPacked={isItemPacked(item.id, item.name, 'master')}
                              tripItemId={getTripItemId(item.id, item.name, 'master')}
                              onRemove={props.onRemoveFromTrip}
                              dragData={dragData}
                              canClickToAdd={props.selectedTarget?.() !== undefined}
                              onClickAdd={() => props.onAddToSelectedBag?.(dragData)}
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </Show>

        <Show when={props.activeTab() === 'built-in'}>
          <Show
            when={filteredBuiltInItems().length > 0}
            fallback={
              <div class="py-8 text-center text-gray-500">
                <p>No matching items found</p>
                <p class="mt-1 text-sm">Try adjusting your search or filters</p>
              </div>
            }
          >
            <For each={filteredBuiltInItems()}>
              {([category, items]) => (
                <div class="mb-2">
                  <button
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={() => toggleCategory(`built-in-${category}`)}
                  >
                    <span
                      class="transition-transform"
                      classList={{ 'rotate-90': isCategoryExpanded(`built-in-${category}`) }}
                    >
                      ▶
                    </span>
                    {category}
                    <span class="text-xs font-normal text-gray-500">({items.length})</span>
                  </button>
                  <Show when={isCategoryExpanded(`built-in-${category}`)}>
                    <div class="ml-2">
                      <For each={items}>
                        {(item) => {
                          const dragData: SourceItemDragData = {
                            type: 'source-item',
                            sourceType: 'built-in',
                            builtInItem: {
                              name: item.name,
                              description: item.description,
                              category: item.category,
                              quantity: item.default_quantity,
                            },
                          };
                          return (
                            <DraggableSourceItem
                              id={`built-in-${item.name}`}
                              name={item.name}
                              category={item.category}
                              quantity={item.default_quantity}
                              description={item.description}
                              isInTrip={isItemInTrip('', item.name, 'built-in')}
                              isPacked={isItemPacked('', item.name, 'built-in')}
                              tripItemId={getTripItemId('', item.name, 'built-in')}
                              onRemove={props.onRemoveFromTrip}
                              dragData={dragData}
                              canClickToAdd={props.selectedTarget?.() !== undefined}
                              onClickAdd={() => props.onAddToSelectedBag?.(dragData)}
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );
}
