/**
 * AddModeBagCards Component
 *
 * Right panel showing compact bag cards as drop targets
 * Each card shows category breakdown of items in the bag
 */

import { Show, For, createMemo, createSignal, type Accessor } from 'solid-js';
import { createDroppable } from '@thisbeyond/solid-dnd';
import type { TripItem, Bag, Category } from '../../lib/types';
import type { AddModeBagDropData, SelectedTarget } from './AddModeView';

interface AddModeBagCardsProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onManageBags?: () => void;
  // For click-to-add: selected target (bag or container) gets highlighted border
  selectedTarget?: Accessor<SelectedTarget | undefined>;
  onSelectTarget?: (target: SelectedTarget | undefined) => void;
}

interface BagCardProps {
  bag: Bag | null; // null for "No Bag"
  bagId: string | null;
  items: Accessor<TripItem[]>; // Use accessor for reactivity
  containers: TripItem[];
  isContainer?: boolean;
  containerId?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  // For passing accordion state to nested containers
  expandedCardId?: Accessor<string | null>;
  onSetExpandedCardId?: (id: string) => void;
  // For click-to-add selection (bags and containers)
  selectedTarget?: Accessor<SelectedTarget | undefined>;
  onSelectTarget?: (target: SelectedTarget | undefined) => void;
}

function DroppableBagCard(props: BagCardProps) {
  const dropId = props.isContainer
    ? `add-mode-container-${props.containerId}`
    : `add-mode-bag-${props.bagId || 'none'}`;

  const droppable = createDroppable(dropId, {
    type: props.isContainer ? 'add-mode-container' : 'add-mode-bag',
    bagId: props.bagId,
    containerId: props.containerId,
  } as AddModeBagDropData);

  // Filter items for this bag/container
  const bagItems = createMemo(() => {
    const allItems = props.items();
    if (props.isContainer && props.containerId) {
      // Container: items where container_item_id matches
      return allItems.filter((i) => i.container_item_id === props.containerId);
    } else {
      // Bag: items where bag_id matches AND not in any container
      // For "No Bag" (bagId === null), match items with bag_id === null
      return allItems.filter((i) => i.bag_id === props.bagId && !i.container_item_id);
    }
  });

  const bagName = () => {
    if (props.isContainer && props.containerId) {
      const container = props.items().find((i) => i.id === props.containerId);
      return container?.name || 'Container';
    }
    return props.bag?.name || 'No Bag';
  };

  // Calculate category summary (count items, not quantities)
  const categorySummary = createMemo(() => {
    const items = bagItems();
    const counts = new Map<string, number>();
    items.forEach((item) => {
      const cat = item.category_name || 'Uncategorized';
      counts.set(cat, (counts.get(cat) || 0) + 1); // Count items, not quantities
    });

    // Sort by count descending, take top 4
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  });

  // Count items (not quantities)
  const totalItems = createMemo(() => {
    return bagItems().length;
  });

  // Count packed items (not quantities)
  const packedItems = createMemo(() => {
    return bagItems().filter((i) => i.is_packed).length;
  });

  // Group items by category for expanded view
  const groupedByCategory = createMemo(() => {
    const items = bagItems();
    const groups = new Map<string, TripItem[]>();
    items.forEach((item) => {
      const cat = item.category_name || 'Uncategorized';
      if (!groups.has(cat)) {
        groups.set(cat, []);
      }
      groups.get(cat)!.push(item);
    });
    // Sort categories alphabetically, items within each category by name
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => [cat, items.sort((a, b) => a.name.localeCompare(b.name))] as const);
  });

  const bagColor = () => props.bag?.color || '#6b7280';

  // Compute if this card is selected
  const isSelected = createMemo(() => {
    const target = props.selectedTarget?.();
    if (!target) return false;
    if (props.isContainer && props.containerId) {
      // Container: selected when containerId matches
      return target.containerId === props.containerId;
    } else {
      // Bag: selected when bagId matches and no containerId
      return target.bagId === props.bagId && target.containerId === null;
    }
  });

  const handleSelect = () => {
    if (!props.onSelectTarget) return;
    // Toggle off if already selected
    if (isSelected()) {
      props.onSelectTarget(undefined);
      return;
    }
    if (props.isContainer && props.containerId) {
      // Container: set containerId, bagId is the parent bag
      props.onSelectTarget({ bagId: props.bagId, containerId: props.containerId });
    } else {
      // Bag: set bagId, containerId is null
      props.onSelectTarget({ bagId: props.bagId, containerId: null });
    }
  };

  return (
    <div
      ref={droppable.ref}
      role="button"
      tabindex={0}
      aria-label={`Select ${bagName()} as target ${props.isContainer ? 'container' : 'bag'}`}
      aria-pressed={isSelected()}
      class="cursor-pointer rounded-lg border-2 px-1 py-2 transition-all md:p-3"
      classList={{
        'border-blue-400 bg-blue-50 shadow-md': droppable.isActiveDroppable,
        'border-green-500 bg-green-50 ring-2 ring-green-200':
          !droppable.isActiveDroppable && isSelected(),
        'border-gray-200 bg-white hover:border-gray-300':
          !droppable.isActiveDroppable && !isSelected(),
        'ml-2 md:ml-6': props.isContainer,
      }}
      onClick={(e) => {
        e.stopPropagation();
        handleSelect();
      }}
      onKeyDown={(e) => {
        // Support keyboard activation
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex min-w-0 flex-1 items-center gap-1 md:gap-2">
          {/* Disclosure triangle */}
          <button
            type="button"
            class="flex h-4 w-4 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600 md:h-5 md:w-5"
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleExpand();
            }}
            title={props.isExpanded ? 'Collapse' : 'Expand'}
          >
            <span
              class="text-[10px] transition-transform md:text-xs"
              classList={{ 'rotate-90': props.isExpanded }}
            >
              ▶
            </span>
          </button>
          {props.isContainer ? (
            <span class="flex-shrink-0 text-sm md:text-lg">📦</span>
          ) : props.bag ? (
            <div
              class="h-2.5 w-2.5 flex-shrink-0 rounded-full md:h-4 md:w-4"
              style={{ 'background-color': bagColor() }}
            />
          ) : (
            <span class="flex-shrink-0 text-sm md:text-lg">📋</span>
          )}
          <span class="truncate text-xs font-semibold text-gray-900 md:text-base">{bagName()}</span>
        </div>
        <span class="ml-1 flex-shrink-0 text-[10px] text-gray-500 md:text-sm">
          {packedItems()}/{totalItems()}
        </span>
      </div>

      {/* Category Summary - hidden on mobile */}
      <Show when={categorySummary().length > 0}>
        <div class="mt-1 hidden flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600 md:flex">
          <For each={categorySummary()}>
            {([category, count]) => (
              <span>
                {category}: <span class="font-medium">{count}</span>
              </span>
            )}
          </For>
        </div>
      </Show>
      {/* Simpler fallback for mobile */}
      <Show when={categorySummary().length === 0}>
        <div class="mt-1 text-center text-xs text-gray-400 italic md:text-sm">Drop items here</div>
      </Show>

      {/* Expanded Contents */}
      <Show when={props.isExpanded && groupedByCategory().length > 0}>
        <div class="mt-2 border-t border-gray-100 pt-2">
          <div class="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
            <For each={groupedByCategory()}>
              {([category, items]) => (
                <div class="text-xs">
                  <div class="font-medium text-gray-600">{category}</div>
                  <div class="text-gray-500">
                    <For each={items}>
                      {(item, index) => (
                        <>
                          {index() > 0 && ', '}
                          {item.name}
                          {item.quantity > 1 && ` (x${item.quantity})`}
                        </>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Containers within this bag */}
      <Show when={!props.isContainer && props.containers.length > 0}>
        <div class="mt-1 space-y-1 md:mt-3 md:space-y-2">
          <For each={props.containers}>
            {(container) => {
              const containerId = `add-mode-container-${container.id}`;
              return (
                <DroppableBagCard
                  bag={props.bag}
                  bagId={props.bagId}
                  items={props.items}
                  containers={[]}
                  isContainer
                  containerId={container.id}
                  isExpanded={props.expandedCardId?.() === containerId}
                  onToggleExpand={() => props.onSetExpandedCardId?.(containerId)}
                  selectedTarget={props.selectedTarget}
                  onSelectTarget={props.onSelectTarget}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function AddModeBagCards(props: AddModeBagCardsProps) {
  // Track which bag/container is expanded (accordion behavior)
  const [expandedCardId, setExpandedCardId] = createSignal<string | null>(null);

  const toggleExpand = (cardId: string) => {
    setExpandedCardId((prev) => (prev === cardId ? null : cardId));
  };

  // Get containers for each bag
  const containersByBag = createMemo(() => {
    const items = props.items() || [];
    const map = new Map<string | null, TripItem[]>();

    items
      .filter((item) => item.is_container)
      .forEach((container) => {
        const bagId = container.bag_id;
        if (!map.has(bagId)) {
          map.set(bagId, []);
        }
        map.get(bagId)!.push(container);
      });

    return map;
  });

  // Sort bags alphabetically, "No Bag" at end
  const sortedBags = createMemo(() => {
    const bags = props.bags() || [];
    return [...bags].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Create a stable accessor for items
  const allItems = () => props.items() || [];

  return (
    <div class="space-y-1.5 md:space-y-3">
      <h3 class="mb-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase md:mb-4 md:text-sm">
        Drop items into bags, or click bag then +
      </h3>

      {/* Regular bags */}
      <For each={sortedBags()}>
        {(bag) => {
          const cardId = `add-mode-bag-${bag.id}`;
          return (
            <DroppableBagCard
              bag={bag}
              bagId={bag.id}
              items={allItems}
              containers={containersByBag().get(bag.id) || []}
              isExpanded={expandedCardId() === cardId}
              onToggleExpand={() => toggleExpand(cardId)}
              expandedCardId={expandedCardId}
              onSetExpandedCardId={(id) => toggleExpand(id)}
              selectedTarget={props.selectedTarget}
              onSelectTarget={props.onSelectTarget}
            />
          );
        }}
      </For>

      {/* No Bag section */}
      {(() => {
        const cardId = 'add-mode-bag-none';
        return (
          <DroppableBagCard
            bag={null}
            bagId={null}
            items={allItems}
            containers={containersByBag().get(null) || []}
            isExpanded={expandedCardId() === cardId}
            onToggleExpand={() => toggleExpand(cardId)}
            expandedCardId={expandedCardId}
            onSetExpandedCardId={(id) => toggleExpand(id)}
            selectedTarget={props.selectedTarget}
            onSelectTarget={props.onSelectTarget}
          />
        );
      })()}
    </div>
  );
}
