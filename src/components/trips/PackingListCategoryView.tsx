/**
 * PackingListCategoryView Component
 *
 * Displays packing list grouped by categories, then by bags
 * Extracted from PackingPage for better separation of concerns
 * Supports drag-and-drop to move items between bags within the same category
 */

import { For, Show, type Accessor, createSignal, createMemo } from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  createDraggable,
  createDroppable,
  type DragEvent,
} from '@thisbeyond/solid-dnd';
import type { TripItem, Bag, Category } from '../../lib/types';
import { PackingItemCard } from './PackingItemCard';
import { SwipeProvider, useSwipeContext } from './SwipeContext';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';
import { liveRectCollision, useAutoScroll, EscapeCancelHandler } from './drag-drop-utils';
import { CheckIcon } from '../ui/Icons';

// Drop zone types - bag sections and container sections
const DROP_ZONE_TYPES = {
  BAG: 'bag-section',
  CONTAINER: 'container-section',
} as const;

interface DragData {
  itemId: string;
  item: TripItem;
  categoryName: string;
}

interface DropData {
  type: (typeof DROP_ZONE_TYPES)[keyof typeof DROP_ZONE_TYPES];
  bagId?: string | null;
  containerId?: string;
  categoryName: string;
}

// Droppable wrapper for bag sections within a category
function DroppableBagSection(props: {
  bagId: string | null;
  categoryName: string;
  isValidDrop: () => boolean;
  children: any;
}) {
  const droppable = createDroppable(`bag-section-${props.categoryName}-${props.bagId ?? 'none'}`, {
    type: DROP_ZONE_TYPES.BAG,
    bagId: props.bagId,
    categoryName: props.categoryName,
  } as DropData);

  return (
    <div
      ref={droppable.ref}
      class={`mb-4 rounded-lg transition-all duration-150 md:mb-2 ${
        droppable.isActiveDroppable && props.isValidDrop()
          ? 'bg-blue-50 ring-2 ring-blue-400'
          : droppable.isActiveDroppable
            ? 'bg-red-50 ring-2 ring-red-300'
            : ''
      }`}
    >
      {props.children}
    </div>
  );
}

// Droppable wrapper for container sections within a category
function DroppableContainerSection(props: {
  containerId: string;
  categoryName: string;
  isValidDrop: () => boolean;
  children: any;
}) {
  const droppable = createDroppable(
    `container-section-${props.categoryName}-${props.containerId}`,
    {
      type: DROP_ZONE_TYPES.CONTAINER,
      containerId: props.containerId,
      categoryName: props.categoryName,
    } as DropData
  );

  return (
    <div
      ref={droppable.ref}
      class={`mb-4 rounded-lg transition-all duration-150 md:mb-2 ${
        droppable.isActiveDroppable && props.isValidDrop()
          ? 'bg-purple-50 ring-2 ring-purple-400'
          : droppable.isActiveDroppable
            ? 'bg-red-50 ring-2 ring-red-300'
            : ''
      }`}
    >
      {props.children}
    </div>
  );
}

// Draggable wrapper for items - passes drag handle props to children
function DraggableItem(props: {
  item: TripItem;
  categoryName: string;
  enabled: boolean;
  children: (dragProps: { dragActivators?: Record<string, any>; isDragging: boolean }) => any;
}) {
  const draggable = createDraggable(props.item.id, {
    itemId: props.item.id,
    item: props.item,
    categoryName: props.categoryName,
  } as DragData);

  return (
    <Show when={props.enabled} fallback={<div>{props.children({ isDragging: false })}</div>}>
      <div ref={draggable.ref}>
        {props.children({
          dragActivators: draggable.dragActivators,
          isDragging: draggable.isActiveDraggable,
        })}
      </div>
    </Show>
  );
}

interface PackingListCategoryViewProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  selectMode: Accessor<boolean>;
  selectedItems: Accessor<Set<string>>;
  showUnpackedOnly?: Accessor<boolean>;
  onTogglePacked: (item: TripItem) => void;
  onToggleSkipped: (item: TripItem) => void;
  onEditItem: (item: TripItem) => void;
  onToggleItemSelection: (itemId: string) => void;
  // Drag-and-drop handlers - only moves between locations, keeps category
  onMoveItemToBag?: (itemId: string, bagId: string | null) => void;
  onMoveItemToContainer?: (itemId: string, containerId: string) => void;
}

// Inner component that uses swipe context
function PackingListCategoryViewInner(props: PackingListCategoryViewProps) {
  const [activeItem, setActiveItem] = createSignal<TripItem | null>(null);
  const [activeCategoryName, setActiveCategoryName] = createSignal<string | null>(null);
  const autoScroll = useAutoScroll();
  const swipeContext = useSwipeContext();

  // Close revealed item when drag starts
  const closeSwipeOnDrag = () => swipeContext.closeAll();

  // Handle drag end - only move if dropping in same category
  const handleDragEnd = (event: DragEvent) => {
    const { draggable, droppable } = event;
    setActiveItem(null);
    setActiveCategoryName(null);
    autoScroll.stop();

    if (!droppable) return;

    const dragData = draggable.data as DragData;
    const dropData = droppable.data as DropData;

    // Only allow drops within the same category
    if (dragData.categoryName !== dropData.categoryName) return;

    if (dropData.type === DROP_ZONE_TYPES.BAG) {
      // Move item to the target bag (keeps category)
      props.onMoveItemToBag?.(dragData.itemId, dropData.bagId ?? null);
    } else if (dropData.type === DROP_ZONE_TYPES.CONTAINER && dropData.containerId) {
      // Move item into container
      props.onMoveItemToContainer?.(dragData.itemId, dropData.containerId);
    }
  };

  const handleDragStart = (event: DragEvent) => {
    const dragData = event.draggable.data as DragData;
    setActiveItem(dragData.item);
    setActiveCategoryName(dragData.categoryName);
    autoScroll.start();
    closeSwipeOnDrag(); // Close any revealed swipe actions when starting drag
  };

  // Check if current drop target is valid (same category as dragged item)
  const isValidDropTarget = (categoryName: string) => {
    return activeCategoryName() === categoryName;
  };

  const itemsByCategory = createMemo(() => {
    const allItems = props.items() || [];
    const allBags = props.bags() || [];

    // Separate containers from regular items
    const containers = allItems.filter((item) => item.is_container);
    const regularItems = allItems.filter((item) => !item.is_container);

    // Group regular items (not in containers) by category, then by bag_id
    const bagGrouped = new Map<string, Map<string | null, TripItem[]>>();
    regularItems
      .filter((item) => !item.container_item_id) // Exclude items in containers
      .forEach((item) => {
        const category = item.category_name || 'Uncategorized';
        const bagId = item.bag_id || null;

        if (!bagGrouped.has(category)) {
          bagGrouped.set(category, new Map());
        }

        const categoryBags = bagGrouped.get(category)!;
        if (!categoryBags.has(bagId)) {
          categoryBags.set(bagId, []);
        }

        categoryBags.get(bagId)!.push(item);
      });

    // Group contained items by category, then by container
    // Filter out zombie containers (items pointing to deleted containers)
    const containerIds = new Set(containers.map((c) => c.id));
    const containerGrouped = new Map<string, Map<string, TripItem[]>>();
    regularItems
      .filter((item) => item.container_item_id && containerIds.has(item.container_item_id)) // Only items in valid containers
      .forEach((item) => {
        const category = item.category_name || 'Uncategorized';
        const containerId = item.container_item_id!;

        if (!containerGrouped.has(category)) {
          containerGrouped.set(category, new Map());
        }

        const categoryContainers = containerGrouped.get(category)!;
        if (!categoryContainers.has(containerId)) {
          categoryContainers.set(containerId, []);
        }

        categoryContainers.get(containerId)!.push(item);
      });

    // Add virtual "Wearing" bag to the list
    const bagsWithWearing = [
      ...allBags,
      {
        id: null as any,
        trip_id: '',
        name: 'Wearing / No Bag',
        type: 'wearing' as any,
        color: null,
        sort_order: 999,
        created_at: new Date(),
      },
    ];

    return { bagGrouped, containerGrouped, allBags: bagsWithWearing, containers };
  });

  // Create lookup maps for O(1) access
  const bagLookup = createMemo(() => {
    const bags = props.bags() || [];
    return new Map(bags.map((b) => [b.id, b]));
  });

  const categoryLookup = createMemo(() => {
    const categories = props.categories() || [];
    return new Map(categories.map((c) => [c.name, c]));
  });

  // Get category icon by name - using lookup map for O(1) access
  const getCategoryIcon = (categoryName: string) => {
    return categoryLookup().get(categoryName)?.icon || '📦';
  };

  // Sort categories alphabetically - combine categories from both bags and containers
  const sortedCategories = createMemo(() => {
    const allCategories = new Set<string>();
    itemsByCategory().bagGrouped.forEach((_, category) => allCategories.add(category));
    itemsByCategory().containerGrouped.forEach((_, category) => allCategories.add(category));
    return Array.from(allCategories).sort((a, b) => a.localeCompare(b));
  });

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetector={liveRectCollision}
    >
      <DragDropSensors />
      <EscapeCancelHandler
        onCancel={() => {
          setActiveItem(null);
          setActiveCategoryName(null);
        }}
      />
      <div class="space-y-6 md:space-y-3">
        <For each={sortedCategories()}>
          {(category) => {
            const categoryBags = () => itemsByCategory().bagGrouped.get(category) || new Map();
            const categoryContainers = () =>
              itemsByCategory().containerGrouped.get(category) || new Map();

            const allCategoryItems = () => [
              ...Array.from(categoryBags().values()).flat(),
              ...Array.from(categoryContainers().values()).flat(),
            ];
            const totalItems = () => allCategoryItems().length;
            const packedItemsCount = () =>
              allCategoryItems().filter((item) => item.is_packed).length;

            // Sort bags alphabetically within category
            const sortedBags = () => {
              return Array.from(categoryBags().entries()).sort(([bagIdA], [bagIdB]) => {
                const bagA = itemsByCategory().allBags.find((b) => b.id === bagIdA);
                const bagB = itemsByCategory().allBags.find((b) => b.id === bagIdB);
                return (bagA?.name || '').localeCompare(bagB?.name || '');
              });
            };

            // Sort containers alphabetically within category
            const sortedContainers = () => {
              return Array.from(categoryContainers().entries()).sort(
                ([containerIdA], [containerIdB]) => {
                  const containerA = itemsByCategory().containers.find(
                    (c) => c.id === containerIdA
                  );
                  const containerB = itemsByCategory().containers.find(
                    (c) => c.id === containerIdB
                  );
                  return (containerA?.name || '').localeCompare(containerB?.name || '');
                }
              );
            };

            // Check if dragging is enabled (not in select mode)
            const isDragEnabled = () => !props.selectMode();

            return (
              <Show when={totalItems() > 0}>
                <div>
                  <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                    <span class="text-xl md:text-lg">{getCategoryIcon(category)}</span>
                    <h2 class="text-lg font-semibold text-gray-900 md:text-base">{category}</h2>
                    <span class="text-sm text-gray-500 md:text-xs">({totalItems()})</span>
                  </div>

                  {/* Show "All packed" summary if filtering and everything is packed */}
                  <Show
                    when={
                      props.showUnpackedOnly?.() &&
                      packedItemsCount() === totalItems() &&
                      totalItems() > 0
                    }
                  >
                    <div class="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                      <CheckIcon class="h-4 w-4" />
                      All {totalItems()} items packed
                    </div>
                  </Show>

                  {/* Bag and container sections (filtered if showUnpackedOnly) */}
                  <Show when={!props.showUnpackedOnly?.() || packedItemsCount() < totalItems()}>
                    {/* Bag sections */}
                    <For each={sortedBags()}>
                      {([bagId, bagItems]) => {
                        const bag = () => itemsByCategory().allBags.find((b) => b.id === bagId);
                        // Sort items alphabetically by name
                        const sortedItems = [...bagItems].sort((a, b) =>
                          a.name.localeCompare(b.name)
                        );
                        const unpackedItems = () =>
                          sortedItems.filter((item) => !item.is_packed && !item.is_skipped);
                        const packedCount = () =>
                          sortedItems.filter((item) => item.is_packed).length;
                        const itemsToShow = () =>
                          props.showUnpackedOnly?.() ? unpackedItems() : sortedItems;
                        const allBagPacked = () =>
                          props.showUnpackedOnly?.() &&
                          itemsToShow().length === 0 &&
                          packedCount() > 0;

                        // Skip bag section if filtering and no items at all
                        return (
                          <Show
                            when={
                              itemsToShow().length > 0 ||
                              (props.showUnpackedOnly?.() && packedCount() > 0)
                            }
                          >
                            <DroppableBagSection
                              bagId={bagId}
                              categoryName={category}
                              isValidDrop={() => isValidDropTarget(category)}
                            >
                              <h3 class="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs">
                                <Show
                                  when={bag()?.id !== null}
                                  fallback={<span class="text-base md:text-sm">👕</span>}
                                >
                                  <div
                                    class={`h-2.5 w-2.5 rounded-full border border-gray-300 md:h-2 md:w-2 ${getBagColorClass(bag()?.color)}`}
                                    style={getBagColorStyle(bag()?.color)}
                                  />
                                </Show>
                                {bag()?.name || 'No bag'}
                                {/* Inline packed count when all items in bag are packed */}
                                <Show when={allBagPacked()}>
                                  <span class="ml-1 flex items-center gap-1 text-gray-400">
                                    ·
                                    <CheckIcon class="h-3 w-3 text-green-600" />
                                    <span class="text-gray-500">{packedCount()} packed</span>
                                  </span>
                                </Show>
                              </h3>
                              <Show when={!allBagPacked()}>
                                <div
                                  class="grid gap-2 md:gap-1.5"
                                  style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                                >
                                  <For each={itemsToShow()}>
                                    {(item) => {
                                      const canDrag = () => isDragEnabled();
                                      return (
                                        <DraggableItem
                                          item={item}
                                          categoryName={category}
                                          enabled={canDrag()}
                                        >
                                          {(dragProps) => (
                                            <PackingItemCard
                                              item={item}
                                              selectMode={props.selectMode()}
                                              isSelected={props.selectedItems().has(item.id)}
                                              bag={bag()}
                                              showBagInfo={true}
                                              onTogglePacked={() => props.onTogglePacked(item)}
                                              onToggleSkipped={() => props.onToggleSkipped(item)}
                                              onEdit={() => props.onEditItem(item)}
                                              onToggleSelection={() =>
                                                props.onToggleItemSelection(item.id)
                                              }
                                              dragActivators={dragProps.dragActivators}
                                              isDragging={dragProps.isDragging}
                                              revealedItemId={swipeContext.revealedItemId}
                                              onRevealChange={swipeContext.setRevealedItemId}
                                            />
                                          )}
                                        </DraggableItem>
                                      );
                                    }}
                                  </For>
                                  {/* Collapsed packed items row - only when there are also unpacked items */}
                                  <Show
                                    when={
                                      props.showUnpackedOnly?.() &&
                                      packedCount() > 0 &&
                                      itemsToShow().length > 0
                                    }
                                  >
                                    <div class="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
                                      <CheckIcon class="h-4 w-4 text-green-600" />
                                      {packedCount()} packed
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            </DroppableBagSection>
                          </Show>
                        );
                      }}
                    </For>

                    {/* Container sections */}
                    <For each={sortedContainers()}>
                      {([containerId, containerItems]) => {
                        const container = () =>
                          itemsByCategory().containers.find((c) => c.id === containerId);
                        const containerBag = () => {
                          const cont = container();
                          if (!cont?.bag_id) return null;
                          return itemsByCategory().allBags.find((b) => b.id === cont.bag_id);
                        };
                        const containerIcon = () => {
                          const cont = container();
                          return cont?.category_name ? getCategoryIcon(cont.category_name) : '📦';
                        };
                        // Sort items alphabetically by name
                        const sortedItems = [...containerItems].sort((a, b) =>
                          a.name.localeCompare(b.name)
                        );
                        const unpackedItems = () =>
                          sortedItems.filter((item) => !item.is_packed && !item.is_skipped);
                        const packedCount = () =>
                          sortedItems.filter((item) => item.is_packed).length;
                        const itemsToShow = () =>
                          props.showUnpackedOnly?.() ? unpackedItems() : sortedItems;
                        const allContainerPacked = () =>
                          props.showUnpackedOnly?.() &&
                          itemsToShow().length === 0 &&
                          packedCount() > 0;

                        return (
                          <Show
                            when={
                              itemsToShow().length > 0 ||
                              (props.showUnpackedOnly?.() && packedCount() > 0)
                            }
                          >
                            <DroppableContainerSection
                              containerId={containerId}
                              categoryName={category}
                              isValidDrop={() => isValidDropTarget(category)}
                            >
                              <h3 class="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-blue-700 md:mb-1 md:text-xs">
                                <span class="text-base md:text-sm">{containerIcon()}</span>
                                {container()?.name || 'Container'}
                                <Show when={containerBag()}>
                                  <span class="text-xs text-gray-500">
                                    in {containerBag()!.name}
                                  </span>
                                </Show>
                                {/* Inline packed count when all items in container are packed */}
                                <Show when={allContainerPacked()}>
                                  <span class="ml-1 flex items-center gap-1 text-gray-400">
                                    ·
                                    <CheckIcon class="h-3 w-3 text-green-600" />
                                    <span class="text-gray-500">{packedCount()} packed</span>
                                  </span>
                                </Show>
                              </h3>
                              <Show when={!allContainerPacked()}>
                                <div
                                  class="grid gap-2 md:gap-1.5"
                                  style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                                >
                                  <For each={itemsToShow()}>
                                    {(item) => (
                                      <DraggableItem
                                        item={item}
                                        categoryName={category}
                                        enabled={isDragEnabled()}
                                      >
                                        {(dragProps) => (
                                          <PackingItemCard
                                            item={item}
                                            selectMode={props.selectMode()}
                                            isSelected={props.selectedItems().has(item.id)}
                                            showBagInfo={false}
                                            onTogglePacked={() => props.onTogglePacked(item)}
                                            onToggleSkipped={() => props.onToggleSkipped(item)}
                                            onEdit={() => props.onEditItem(item)}
                                            onToggleSelection={() =>
                                              props.onToggleItemSelection(item.id)
                                            }
                                            dragActivators={dragProps.dragActivators}
                                            isDragging={dragProps.isDragging}
                                            revealedItemId={swipeContext.revealedItemId}
                                            onRevealChange={swipeContext.setRevealedItemId}
                                          />
                                        )}
                                      </DraggableItem>
                                    )}
                                  </For>
                                  {/* Collapsed packed items row - only when there are also unpacked items */}
                                  <Show
                                    when={
                                      props.showUnpackedOnly?.() &&
                                      packedCount() > 0 &&
                                      itemsToShow().length > 0
                                    }
                                  >
                                    <div class="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
                                      <CheckIcon class="h-4 w-4 text-green-600" />
                                      {packedCount()} packed
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            </DroppableContainerSection>
                          </Show>
                        );
                      }}
                    </For>
                  </Show>
                </div>
              </Show>
            );
          }}
        </For>
      </div>

      {/* Drag Overlay - shows preview of item being dragged */}
      <DragOverlay>
        <Show when={activeItem()}>
          <div class="rounded-lg border border-blue-300 bg-white p-3 shadow-xl ring-2 ring-blue-500">
            <p class="font-medium text-gray-900">{activeItem()!.name}</p>
            <Show when={activeCategoryName()}>
              <p class="text-sm text-gray-500">{activeCategoryName()}</p>
            </Show>
          </div>
        </Show>
      </DragOverlay>
    </DragDropProvider>
  );
}

// Export wrapper that provides swipe context
export function PackingListCategoryView(props: PackingListCategoryViewProps) {
  return (
    <SwipeProvider>
      <PackingListCategoryViewInner {...props} />
    </SwipeProvider>
  );
}
