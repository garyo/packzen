/**
 * AddModeLeftPanel Component
 *
 * Item sources for Add mode: My Items and Suggestions (with starter lists).
 * Tap a row to add it to the current target; on desktop rows can also be
 * dragged onto a bag.
 */

import { createSignal, Show, For, createMemo, type Accessor, type JSX } from 'solid-js';
import { createDraggable } from '@thisbeyond/solid-dnd';
import type {
  BuiltInItem,
  TripItem,
  MasterItemWithCategory,
  SelectedBuiltInItem,
} from '../../lib/types';
import { builtInItems, getItemsByTripTypes, type StarterModifier } from '../../lib/built-in-items';
import type { SourceItemDragData } from './AddModeView';
import { StarterPicker } from './StarterListPanel';
import { TrashIcon, PlusIcon } from '../ui/Icons';

interface AddModeLeftPanelProps {
  activeTab: Accessor<'my-items' | 'built-in'>;
  onTabChange: (tab: 'my-items' | 'built-in') => void;
  items: Accessor<TripItem[] | undefined>;
  masterItems: Accessor<MasterItemWithCategory[] | undefined>;
  onRemoveFromTrip: (tripItemId: string) => void;
  /** Open the new-item form, optionally with a name filled in. */
  onAddNewItem: (name?: string) => void;
  isDragging: Accessor<boolean>;
  onAdd: (item: SelectedBuiltInItem) => void;
  // Bulk-add a category of suggestions (items not yet in the trip)
  onAddAll: (items: SelectedBuiltInItem[]) => void;
  onAddStarter: (tripTypeId: string, modifiers: StarterModifier[]) => Promise<number>;
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
  onAdd: () => void;
}

function DraggableSourceItem(props: DraggableItemProps) {
  const draggable = createDraggable(props.id, props.dragData);

  return (
    <div
      ref={draggable.ref}
      class="flex min-h-11 items-center gap-2 rounded-md pl-2 transition-colors md:pl-1"
      classList={{
        'cursor-pointer hover:bg-gray-50': !props.isInTrip,
        'bg-blue-50': draggable.isActiveDraggable,
      }}
      onClick={() => !props.isInTrip && props.onAdd()}
    >
      {/* Drag handle (desktop: phones show items and bags on separate panes) */}
      <div
        class="hidden cursor-grab flex-col gap-0.5 p-1 text-gray-400 md:flex"
        classList={{ invisible: props.isInTrip }}
        style={{ 'touch-action': 'none' }}
        aria-hidden="true"
        {...draggable.dragActivators}
      >
        <For each={[0, 1, 2]}>
          {() => (
            <div class="flex gap-0.5">
              <span class="h-1 w-1 rounded-full bg-current" />
              <span class="h-1 w-1 rounded-full bg-current" />
            </div>
          )}
        </For>
      </div>

      <div class="min-w-0 flex-1" classList={{ 'opacity-50': props.isInTrip }}>
        <div class="flex items-center gap-2">
          <Show when={props.isContainer}>
            <span class="text-xs" title="Container">
              📦
            </span>
          </Show>
          <span class="truncate font-medium text-gray-900">{props.name}</span>
          <Show when={(props.quantity ?? 1) > 1}>
            <span class="text-xs text-gray-500">×{props.quantity}</span>
          </Show>
        </div>
        <Show when={props.description}>
          <p class="truncate text-xs text-gray-500">{props.description}</p>
        </Show>
      </div>

      <Show
        when={props.isInTrip}
        fallback={
          <button
            type="button"
            class="flex flex-shrink-0 items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              props.onAdd();
            }}
            aria-label={`Add ${props.name}`}
          >
            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white">
              <PlusIcon class="h-4 w-4" />
            </span>
          </button>
        }
      >
        <span class="flex-shrink-0 text-xs text-gray-500">
          {props.isPacked ? '✓ Packed' : '✓ Added'}
        </span>
        <Show when={props.tripItemId}>
          {(tripItemId) => (
            <button
              type="button"
              class="flex flex-shrink-0 items-center justify-center text-gray-400 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                props.onRemove(tripItemId());
              }}
              aria-label={`Remove ${props.name} from trip`}
              title="Remove from trip"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
          )}
        </Show>
      </Show>
    </div>
  );
}

/** Empty list: offer to add what was searched for, or explain why it's empty. */
function NoMatches(props: {
  query: string;
  onAddNamed: (name: string) => void;
  empty: JSX.Element;
}) {
  return (
    <div class="px-2 py-8 text-center text-gray-500">
      <Show when={props.query} fallback={props.empty}>
        <p>Nothing matches “{props.query}”</p>
        <button
          type="button"
          onClick={() => props.onAddNamed(props.query)}
          class="mt-2 inline-flex items-center gap-1 rounded-md px-3 font-medium text-blue-700 hover:bg-blue-50"
        >
          <PlusIcon class="h-4 w-4" />
          Add “{props.query}”
        </button>
      </Show>
    </div>
  );
}

export function AddModeLeftPanel(props: AddModeLeftPanelProps) {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [showStarters, setShowStarters] = createSignal(false);
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
          placeholder="Search items…"
          aria-label="Search items"
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          class="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none md:px-3 md:py-2"
        />
        <button
          type="button"
          onClick={() => props.onAddNewItem()}
          class="flex flex-shrink-0 items-center justify-center gap-1 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
          title="Add an item that isn't listed"
        >
          <PlusIcon class="h-4 w-4" />
          New
        </button>
      </div>

      {/* Trip Type Filters (built-in tab only) */}
      <Show when={props.activeTab() === 'built-in'}>
        <div class="flex gap-1 overflow-x-auto border-b border-gray-200 p-2 md:flex-wrap md:p-3">
          <For each={builtInItems.trip_types}>
            {(type) => (
              <button
                class="btn-compact flex-shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors"
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
              <NoMatches
                query={searchQuery().trim()}
                onAddNamed={props.onAddNewItem}
                empty={
                  <>
                    <p>No saved items yet</p>
                    <p class="mt-1 text-sm">
                      Items you add are saved here for next time. Try{' '}
                      <button
                        type="button"
                        class="btn-compact text-blue-600 underline"
                        onClick={() => props.onTabChange('built-in')}
                      >
                        Suggestions
                      </button>
                      , or tap New.
                    </p>
                  </>
                }
              />
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
                              onAdd={() => props.onAdd(source)}
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
          <Show when={!searchQuery().trim()}>
            <div class="mb-2 rounded-lg border border-blue-100 bg-blue-50/50">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 text-left text-sm font-semibold text-gray-700"
                aria-expanded={showStarters()}
                onClick={() => setShowStarters(!showStarters())}
              >
                <span class="transition-transform" classList={{ 'rotate-90': showStarters() }}>
                  ▶
                </span>
                Starter lists
                <span class="text-xs font-normal text-gray-500">a whole set in one tap</span>
              </button>
              <Show when={showStarters()}>
                <div class="px-2 pb-3">
                  <StarterPicker onPick={props.onAddStarter} compact />
                </div>
              </Show>
            </div>
          </Show>
          <Show
            when={filteredBuiltInItems().length > 0}
            fallback={
              <NoMatches
                query={searchQuery().trim()}
                onAddNamed={props.onAddNewItem}
                empty={<p>No suggestions match those trip types</p>}
              />
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
                                onAdd={() => props.onAdd(source)}
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
