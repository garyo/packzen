/**
 * AddModeLeftPanel Component
 *
 * Left panel with tabs for item sources (My Saved Items, Built-in)
 * Items are draggable to bag cards in the right panel
 */

import { createSignal, Show, For, createMemo, type Accessor } from 'solid-js';
import { createDraggable } from '@thisbeyond/solid-dnd';
import type {
  BuiltInItem,
  TripItem,
  MasterItemWithCategory,
  SelectedBuiltInItem,
} from '../../lib/types';
import { builtInItems, getItemsByTripTypes } from '../../lib/built-in-items';
import type { SourceItemDragData } from './AddModeView';
import { TrashIcon, PlusIcon } from '../ui/Icons';

interface AddModeLeftPanelProps {
  activeTab: Accessor<'my-items' | 'built-in'>;
  onTabChange: (tab: 'my-items' | 'built-in') => void;
  items: Accessor<TripItem[] | undefined>;
  masterItems: Accessor<MasterItemWithCategory[] | undefined>;
  onRemoveFromTrip: (tripItemId: string) => void;
  onAddNewItem: () => void;
  isDragging: Accessor<boolean>;
  // Click-to-add needs a selected bag or container
  hasTarget: Accessor<boolean>;
  onAdd: (item: SelectedBuiltInItem) => void;
  // Bulk-add a category of suggestions (items not yet in the trip)
  onAddAll: (items: SelectedBuiltInItem[]) => void;
}

const fromMasterItem = (item: MasterItemWithCategory): SelectedBuiltInItem => ({
  name: item.name,
  description: item.description,
  category: item.category_name ?? '',
  quantity: item.default_quantity,
  is_container: item.is_container,
});

const fromBuiltInItem = (item: BuiltInItem): SelectedBuiltInItem => ({
  name: item.name,
  description: item.description,
  category: item.category,
  quantity: item.default_quantity,
  is_container: item.is_container,
});

interface DraggableItemProps {
  id: string;
  name: string;
  category: string;
  quantity?: number;
  description?: string | null;
  isInTrip: boolean;
  isPacked?: boolean;
  isContainer?: boolean;
  tripItemId?: string; // ID of the trip item (for removal)
  dragData: SourceItemDragData;
  onRemove: (tripItemId: string) => void;
  // For click-to-add
  canClickToAdd: boolean;
  onClickAdd: () => void;
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
          props.tripItemId ? (
            <button
              type="button"
              class="btn-compact flex h-5 w-7 cursor-pointer items-center justify-center rounded text-gray-400 hover:bg-red-100 hover:text-red-600"
              onClick={() => props.onRemove(props.tripItemId!)}
              title="Remove from trip"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
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
          {props.isContainer && (
            <span class="text-xs" title="Container">
              📦
            </span>
          )}
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
          class="ml-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 md:h-6 md:w-6"
          onClick={(e) => {
            e.stopPropagation();
            props.onClickAdd();
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
  // Track manually expanded categories (all categories start collapsed), persisted in localStorage
  const STORAGE_KEY = 'packzen-addmode-expanded-categories';
  const loadExpanded = (): Set<string> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };
  const [manuallyExpanded, setManuallyExpanded] = createSignal<Set<string>>(loadExpanded());

  // First trip item for each master_item_id and for each lowercased name
  // (first match wins, like items.find()).
  const tripItemLookups = createMemo(() => {
    const byMasterItemId = new Map<string, TripItem>();
    const byName = new Map<string, TripItem>();
    for (const item of props.items() ?? []) {
      if (item.master_item_id && !byMasterItemId.has(item.master_item_id)) {
        byMasterItemId.set(item.master_item_id, item);
      }
      const key = item.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, item);
    }
    return { byMasterItemId, byName };
  });

  // The trip item for a source item: by master item id when there is one,
  // else by name (which also catches items added without a master item link).
  const findTripItem = (name: string, masterItemId?: string) => {
    const { byMasterItemId, byName } = tripItemLookups();
    return (
      (masterItemId ? byMasterItemId.get(masterItemId) : undefined) ??
      byName.get(name.toLowerCase())
    );
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
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Category is expanded if:
  // - It's been manually expanded, OR
  // - There's an active search (override to show results)
  const isCategoryExpanded = (category: string) => {
    const isSearching = searchQuery().trim().length > 0;
    if (isSearching) {
      return true;
    }
    return manuallyExpanded().has(category);
  };

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
          Suggestions
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
        <button
          type="button"
          onClick={props.onAddNewItem}
          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 md:h-9 md:w-9"
          title="Add new item"
        >
          <PlusIcon class="h-4 w-4 md:h-5 md:w-5" />
        </button>
      </div>

      {/* Trip Type Filters (built-in tab only) */}
      <Show when={props.activeTab() === 'built-in'}>
        <div class="flex flex-wrap gap-1 border-b border-gray-200 p-2 md:p-3">
          <For each={builtInItems.trip_types}>
            {(type) => (
              <button
                class="rounded-full px-2 py-1 text-xs transition-colors"
                classList={{
                  'bg-blue-100 text-blue-700': selectedTripTypes().has(type.id),
                  'bg-gray-100 text-gray-600 hover:bg-gray-200': !selectedTripTypes().has(type.id),
                }}
                onClick={() => toggleTripType(type.id)}
              >
                {type.name}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Item List - disable scroll during drag to prevent unwanted auto-scroll */}
      <div
        class="flex-1 p-1 md:p-2"
        classList={{
          'overflow-y-auto': !props.isDragging(),
          'overflow-hidden': props.isDragging(),
        }}
      >
        <Show when={props.activeTab() === 'my-items'}>
          <Show
            when={groupedMasterItems().length > 0}
            fallback={
              <div class="py-8 text-center text-gray-500">
                <p>No items in My Items list</p>
                <p class="mt-1 text-sm">Add items on the My Items page first</p>
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
                          const source = fromMasterItem(item);
                          const tripItem = () => findTripItem(item.name, item.id);
                          return (
                            <DraggableSourceItem
                              id={`master-${item.id}`}
                              name={item.name}
                              category={item.category_name || 'Uncategorized'}
                              quantity={item.default_quantity}
                              description={item.description}
                              isInTrip={!!tripItem()}
                              isPacked={tripItem()?.is_packed ?? false}
                              isContainer={item.is_container}
                              tripItemId={tripItem()?.id}
                              onRemove={props.onRemoveFromTrip}
                              dragData={{ type: 'source-item', item: source }}
                              canClickToAdd={props.hasTarget()}
                              onClickAdd={() => props.onAdd(source)}
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
              {([category, items]) => {
                const addableItems = () => items.filter((item) => !findTripItem(item.name));
                return (
                  <div class="mb-2">
                    <div class="flex items-center gap-1">
                      <button
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100"
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
                      <Show when={addableItems().length > 0}>
                        <button
                          type="button"
                          class="flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          onClick={() => props.onAddAll(addableItems().map(fromBuiltInItem))}
                          title={`Add all ${category} items not yet on this trip`}
                        >
                          Add all ({addableItems().length})
                        </button>
                      </Show>
                    </div>
                    <Show when={isCategoryExpanded(`built-in-${category}`)}>
                      <div class="ml-2">
                        <For each={items}>
                          {(item) => {
                            const source = fromBuiltInItem(item);
                            const tripItem = () => findTripItem(item.name);
                            return (
                              <DraggableSourceItem
                                id={`built-in-${item.name}`}
                                name={item.name}
                                category={item.category}
                                quantity={item.default_quantity}
                                description={item.description}
                                isInTrip={!!tripItem()}
                                isPacked={tripItem()?.is_packed ?? false}
                                isContainer={item.is_container}
                                tripItemId={tripItem()?.id}
                                onRemove={props.onRemoveFromTrip}
                                dragData={{ type: 'source-item', item: source }}
                                canClickToAdd={props.hasTarget()}
                                onClickAdd={() => props.onAdd(source)}
                              />
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
        </Show>
      </div>
    </div>
  );
}
