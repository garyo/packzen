/**
 * PackingListBagView Component
 *
 * Displays packing list grouped by bags, then by categories
 * Extracted from PackingPage for better separation of concerns
 * Now supports container items (sub-bags) with dedicated sections
 * Supports drag-and-drop to move items between bags and categories
 */

import { For, Show, type Accessor, createMemo, createSignal, onMount, onCleanup } from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  createDraggable,
  createDroppable,
  useDragDropContext,
  type DragEvent,
} from '@thisbeyond/solid-dnd';
import type { TripItem, Bag, Category } from '../../lib/types';
import { PackingItemCard } from './PackingItemCard';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';
import { liveRectCollision, useAutoScroll, EscapeCancelHandler } from './drag-drop-utils';

// Drop zone type identifiers
// Simplified: D&D only moves items between locations (bags, containers), never changes category
const DROP_ZONE_TYPES = {
  BAG: 'bag',
  CONTAINER: 'container',
} as const;

interface DragData {
  itemId: string;
  item: TripItem;
}

interface DropData {
  type: (typeof DROP_ZONE_TYPES)[keyof typeof DROP_ZONE_TYPES];
  bagId?: string | null;
  containerId?: string;
}

// Droppable wrapper for entire bag sections
// Drag only changes location (bag), never category
function DroppableBagSection(props: { bagId: string | null; children: any }) {
  const droppable = createDroppable(`bag-${props.bagId ?? 'none'}`, {
    type: DROP_ZONE_TYPES.BAG,
    bagId: props.bagId,
  } as DropData);

  return (
    <div
      ref={droppable.ref}
      class={`rounded-lg transition-all duration-150 ${
        droppable.isActiveDroppable ? 'bg-blue-100 ring-2 ring-blue-400' : ''
      }`}
    >
      {props.children}
    </div>
  );
}

// Droppable wrapper for container sections
function DroppableContainerSection(props: { containerId: string; children: any }) {
  const droppable = createDroppable(`container-${props.containerId}`, {
    type: DROP_ZONE_TYPES.CONTAINER,
    containerId: props.containerId,
  } as DropData);

  return (
    <div
      ref={droppable.ref}
      class={`rounded-lg transition-all duration-150 ${
        droppable.isActiveDroppable ? 'bg-purple-100 ring-2 ring-purple-400' : ''
      }`}
    >
      {props.children}
    </div>
  );
}

// Wayfinding nav bar component - needs to be inside DragDropProvider to access context
function WayfindingNavBar(props: {
  bags: Array<{ id: string | null; name: string; color: string | null }>;
  containers: TripItem[];
  currentSection: () => string | null;
  activeItem: () => TripItem | null;
  onScrollToSection: (sectionId: string) => void;
}) {
  const [dndState] = useDragDropContext()!;

  // Determine which nav item to highlight
  const highlightedNavItem = () => {
    // If dragging and hovering over a droppable, highlight that
    if (props.activeItem() && dndState.active.droppable) {
      const droppableId = String(dndState.active.droppable.id);
      // Convert "bag-abc123" to "bag-section-abc123"
      if (droppableId.startsWith('bag-')) {
        const bagId = droppableId.slice(4);
        return bagId === 'none' ? 'bag-section-none' : `bag-section-${bagId}`;
      } else if (droppableId.startsWith('container-')) {
        return `container-section-${droppableId.slice(10)}`;
      }
    }
    // Otherwise show current scroll position
    return props.currentSection();
  };

  return (
    <div class="sticky top-0 z-10 -mx-4 bg-gray-50/95 px-4 py-1.5 backdrop-blur-sm md:-mx-3 md:px-3">
      <div class="flex flex-wrap gap-x-1 gap-y-0">
        {/* Bags */}
        <For each={props.bags}>
          {(bag) => {
            const sectionId = bag.id ? `bag-section-${bag.id}` : 'bag-section-none';
            const isHighlighted = () => highlightedNavItem() === sectionId;
            return (
              <button
                onClick={() => props.onScrollToSection(sectionId)}
                class={`flex items-center gap-1 px-1.5 py-0.5 text-xs ${
                  isHighlighted()
                    ? 'text-gray-900 underline decoration-2 underline-offset-2'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                style="min-height: 16px"
              >
                <Show when={bag.id !== null} fallback={<span class="text-[10px]">👕</span>}>
                  <div
                    class={`h-2 w-2 rounded-full border border-gray-300 ${getBagColorClass(bag.color)}`}
                    style={getBagColorStyle(bag.color)}
                  />
                </Show>
                <span class="max-w-[100px] truncate">{bag.name}</span>
              </button>
            );
          }}
        </For>
        {/* Containers */}
        <Show when={props.containers.length > 0}>
          <span class="mx-1 self-center text-gray-300">|</span>
          <For each={props.containers}>
            {(container) => {
              const sectionId = `container-section-${container.id}`;
              const isHighlighted = () => highlightedNavItem() === sectionId;
              return (
                <button
                  onClick={() => props.onScrollToSection(sectionId)}
                  class={`flex items-center gap-1 px-1.5 py-0.5 text-xs ${
                    isHighlighted()
                      ? 'text-gray-900 underline decoration-2 underline-offset-2'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                  style="min-height: 16px"
                >
                  <span class="text-[10px]">📦</span>
                  <span class="max-w-[100px] truncate">{container.name}</span>
                </button>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
}

// Draggable wrapper for items - passes drag handle props to children
function DraggableItem(props: {
  item: TripItem;
  enabled: boolean;
  children: (dragProps: { dragActivators?: Record<string, any>; isDragging: boolean }) => any;
}) {
  const draggable = createDraggable(props.item.id, {
    itemId: props.item.id,
    item: props.item,
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

interface PackingListBagViewProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  selectMode: Accessor<boolean>;
  selectedItems: Accessor<Set<string>>;
  onTogglePacked: (item: TripItem) => void;
  onEditItem: (item: TripItem) => void;
  onToggleItemSelection: (itemId: string) => void;
  // Add item callbacks for bags and containers
  onAddToBag?: (bagId: string) => void;
  onAddToContainer?: (containerId: string) => void;
  onAddFromMasterToBag?: (bagId: string) => void;
  onAddFromMasterToContainer?: (containerId: string) => void;
  onBrowseTemplatesToBag?: (bagId: string) => void;
  onBrowseTemplatesToContainer?: (containerId: string) => void;
  // Drag-and-drop handlers
  onMoveItemToBag?: (itemId: string, bagId: string | null) => void;
  onMoveItemToContainer?: (itemId: string, containerId: string) => void;
}

export function PackingListBagView(props: PackingListBagViewProps) {
  const [openBagMenu, setOpenBagMenu] = createSignal<string | null>(null);
  const [openContainerMenu, setOpenContainerMenu] = createSignal<string | null>(null);
  const [activeItem, setActiveItem] = createSignal<TripItem | null>(null);
  const autoScroll = useAutoScroll();

  // Handle drag end - dispatch to appropriate handler
  // Simplified: D&D only moves items between locations (bags, containers), never changes category
  const handleDragEnd = (event: DragEvent) => {
    const { draggable, droppable } = event;
    setActiveItem(null);
    autoScroll.stop();

    if (!droppable) return;

    const dragData = draggable.data as DragData;
    const dropData = droppable.data as DropData;

    if (dropData.type === DROP_ZONE_TYPES.BAG) {
      // Moving to bag - keep category, clear container
      props.onMoveItemToBag?.(dragData.itemId, dropData.bagId ?? null);
    } else if (dropData.type === DROP_ZONE_TYPES.CONTAINER) {
      // Moving into container
      if (dropData.containerId) {
        props.onMoveItemToContainer?.(dragData.itemId, dropData.containerId);
      }
    }
  };

  const handleDragStart = (event: DragEvent) => {
    const dragData = event.draggable.data as DragData;
    setActiveItem(dragData.item);
    autoScroll.start();
  };

  // Get all container items and their contents
  const containerData = createMemo(() => {
    const allItems = props.items() || [];
    const containers = allItems.filter((item) => item.is_container);
    const containedItems = new Map<string, TripItem[]>(); // container_id -> items inside

    // Group contained items by their container
    allItems.forEach((item) => {
      if (item.container_item_id) {
        if (!containedItems.has(item.container_item_id)) {
          containedItems.set(item.container_item_id, []);
        }
        containedItems.get(item.container_item_id)!.push(item);
      }
    });

    return { containers, containedItems };
  });

  // Get contents count for a container
  const getContainerContents = (containerId: string) => {
    return containerData().containedItems.get(containerId) || [];
  };

  const getContainerPackedCount = (containerId: string) => {
    return getContainerContents(containerId).filter((item) => item.is_packed).length;
  };

  // Scroll to a container section
  const scrollToContainer = (containerId: string) => {
    const element = document.getElementById(`container-section-${containerId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Scroll to a bag section
  const scrollToBag = (bagId: string) => {
    const element = document.getElementById(`bag-section-${bagId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const itemsByBag = () => {
    const allItems = props.items() || [];
    const allBags = props.bags() || [];
    const grouped = new Map<string | null, Map<string, TripItem[]>>();

    // Group items by bag_id, then by category
    // EXCLUDE items that are inside containers (they'll be shown in container sections)
    allItems
      .filter((item) => !item.container_item_id)
      .forEach((item) => {
        const bagId = item.bag_id || null;
        const category = item.category_name || 'Uncategorized';

        if (!grouped.has(bagId)) {
          grouped.set(bagId, new Map());
        }

        const bagCategories = grouped.get(bagId)!;
        if (!bagCategories.has(category)) {
          bagCategories.set(category, []);
        }

        bagCategories.get(category)!.push(item);
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

    return { grouped, allBags: bagsWithWearing };
  };

  // Get category icon by name
  const getCategoryIcon = (categoryName: string) => {
    const allCategories = props.categories() || [];
    const category = allCategories.find((c) => c.name === categoryName);
    return category?.icon || '📦';
  };

  // Sort bags alphabetically
  const sortedBags = () => {
    return [...itemsByBag().allBags].sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get all containers (even empty ones), sorted by name
  const allContainers = () => {
    return containerData().containers.sort((a, b) => a.name.localeCompare(b.name));
  };

  // Find the bag for a container (for display purposes)
  const getBagForItem = (item: TripItem) => {
    const allBags = props.bags() || [];
    return allBags.find((b) => b.id === item.bag_id);
  };

  // Track current visible section for wayfinding nav bar
  const [currentSection, setCurrentSection] = createSignal<string | null>(null);

  // Set up Intersection Observer to track which section is visible
  // We track all visible sections and pick the topmost one
  onMount(() => {
    const visibleSections = new Set<string>();

    // Find the scroll container to use as root
    const scrollContainer = document.querySelector('main.overflow-y-auto') as HTMLElement | null;

    const observer = new IntersectionObserver(
      (entries) => {
        // Update the set of visible sections
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        // Find the topmost visible section by checking DOM order
        const allSections = document.querySelectorAll(
          '[id^="bag-section-"], [id^="container-section-"]'
        );
        for (const section of allSections) {
          if (visibleSections.has(section.id)) {
            setCurrentSection(section.id);
            return;
          }
        }

        // If nothing visible, keep the last one
      },
      {
        root: scrollContainer, // Use scroll container as root
        rootMargin: '-28px 0px 0px 0px', // Account for sticky nav bar height
        threshold: 0,
      }
    );

    // Observe all sections after a short delay to ensure DOM is ready
    setTimeout(() => {
      const bagSections = document.querySelectorAll('[id^="bag-section-"]');
      const containerSections = document.querySelectorAll('[id^="container-section-"]');
      bagSections.forEach((el) => observer.observe(el));
      containerSections.forEach((el) => observer.observe(el));
    }, 100);

    onCleanup(() => observer.disconnect());
  });

  // Scroll to a section smoothly within the scroll container
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    const scrollContainer = document.querySelector('main.overflow-y-auto');
    if (element && scrollContainer) {
      // Get position relative to scroll container
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top + scrollContainer.scrollTop - 28; // ~28px for nav bar
      scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetector={liveRectCollision}
    >
      <DragDropSensors />
      <EscapeCancelHandler onCancel={() => setActiveItem(null)} />
      <div class="space-y-6 md:space-y-3">
        {/* Sticky Wayfinding Nav Bar */}
        <Show when={sortedBags().length > 1 || allContainers().length > 0}>
          <WayfindingNavBar
            bags={sortedBags()}
            containers={allContainers()}
            currentSection={currentSection}
            activeItem={activeItem}
            onScrollToSection={scrollToSection}
          />
        </Show>

        {/* Bag Sections */}
        <For each={sortedBags()}>
          {(bag) => {
            const bagCategories = () => itemsByBag().grouped.get(bag.id) || new Map();
            const allBagItems = () => Array.from(bagCategories().values()).flat();
            const totalItems = () => allBagItems().length;
            const packedItems = () => allBagItems().filter((item) => item.is_packed).length;
            // Sort categories alphabetically within bag
            const sortedCategories = () => {
              return Array.from(bagCategories().entries()).sort(([a], [b]) => a.localeCompare(b));
            };
            // Check if dragging is enabled (not in select mode)
            const isDragEnabled = () => !props.selectMode();
            return (
              <DroppableBagSection bagId={bag.id}>
                <div id={bag.id ? `bag-section-${bag.id}` : 'bag-section-none'} class="p-2">
                  <div class="mb-3 flex items-center gap-2 px-2 py-1 md:mb-1.5">
                    <Show
                      when={bag.id !== null}
                      fallback={<span class="text-lg md:text-base">👕</span>}
                    >
                      <div
                        class={`h-3 w-3 rounded-full border border-gray-300 md:h-2.5 md:w-2.5 ${getBagColorClass(bag.color)}`}
                        style={getBagColorStyle(bag.color)}
                      />
                    </Show>
                    <h2 class="flex-1 text-lg font-semibold text-gray-900 md:text-base">
                      {bag.name}
                    </h2>
                    <span class="text-sm text-gray-500 md:text-xs">
                      {packedItems()} / {totalItems()}
                    </span>
                    {/* Add items button */}
                    <Show when={bag.id !== null}>
                      <div class="relative">
                        <button
                          onClick={() =>
                            setOpenBagMenu(openBagMenu() === bag.id ? null : (bag.id as string))
                          }
                          class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
                          title="Add items to this bag"
                        >
                          <svg
                            class="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                        <Show when={openBagMenu() === bag.id}>
                          <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                            <button
                              onClick={() => {
                                props.onAddToBag?.(bag.id as string);
                                setOpenBagMenu(null);
                              }}
                              class="w-full px-4 py-2 text-left text-sm font-bold hover:bg-gray-100"
                            >
                              ✏️ New Item
                            </button>
                            <button
                              onClick={() => {
                                props.onAddFromMasterToBag?.(bag.id as string);
                                setOpenBagMenu(null);
                              }}
                              class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                            >
                              📋 From My Items
                            </button>
                            <button
                              onClick={() => {
                                props.onBrowseTemplatesToBag?.(bag.id as string);
                                setOpenBagMenu(null);
                              }}
                              class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                            >
                              📚 From Templates
                            </button>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                  <For each={sortedCategories()}>
                    {([category, categoryItems]) => {
                      // Sort items alphabetically by name
                      const sortedItems = [...categoryItems].sort((a, b) =>
                        a.name.localeCompare(b.name)
                      );
                      return (
                        <div class="mb-4 md:mb-2">
                          <h3 class="mb-2 flex items-center gap-1 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs">
                            <span class="text-base md:text-sm">{getCategoryIcon(category)}</span>
                            {category}
                          </h3>
                          <div
                            class="grid gap-2 md:gap-1.5"
                            style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                          >
                            <For each={sortedItems}>
                              {(item) => {
                                // All items are now draggable (including those in containers)
                                const canDrag = () => isDragEnabled();
                                return (
                                  <DraggableItem item={item} enabled={canDrag()}>
                                    {(dragProps) => (
                                      <PackingItemCard
                                        item={item}
                                        selectMode={props.selectMode()}
                                        isSelected={props.selectedItems().has(item.id)}
                                        showCategoryInfo={true}
                                        categoryIcon={
                                          item.is_container && item.category_name
                                            ? getCategoryIcon(item.category_name)
                                            : undefined
                                        }
                                        onTogglePacked={() => props.onTogglePacked(item)}
                                        onEdit={() => props.onEditItem(item)}
                                        onToggleSelection={() =>
                                          props.onToggleItemSelection(item.id)
                                        }
                                        containerContentsCount={
                                          item.is_container
                                            ? getContainerContents(item.id).length
                                            : undefined
                                        }
                                        containerPackedCount={
                                          item.is_container
                                            ? getContainerPackedCount(item.id)
                                            : undefined
                                        }
                                        onContainerClick={
                                          item.is_container &&
                                          getContainerContents(item.id).length > 0
                                            ? () => scrollToContainer(item.id)
                                            : undefined
                                        }
                                        dragActivators={dragProps.dragActivators}
                                        isDragging={dragProps.isDragging}
                                      />
                                    )}
                                  </DraggableItem>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </DroppableBagSection>
            );
          }}
        </For>

        {/* Container Sections (sub-bags with their contents) */}
        <Show when={allContainers().length > 0}>
          <div class="border-t border-gray-200 pt-6 md:pt-3">
            <h2 class="mb-4 text-lg font-semibold text-gray-700 md:mb-2 md:text-base">
              📦 Container Contents
            </h2>
            <For each={allContainers()}>
              {(container) => {
                const contents = () => getContainerContents(container.id);
                const packedCount = () => contents().filter((item) => item.is_packed).length;
                const containerBag = () => getBagForItem(container);
                const containerIcon = () =>
                  container.category_name ? getCategoryIcon(container.category_name) : '📦';
                // Sort contents alphabetically
                const sortedContents = () =>
                  [...contents()].sort((a, b) => a.name.localeCompare(b.name));

                const isDragEnabled = () => !props.selectMode();
                return (
                  <DroppableContainerSection containerId={container.id}>
                    <div
                      id={`container-section-${container.id}`}
                      class="mb-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 md:mb-3 md:p-2"
                    >
                      <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                        <span class="text-lg md:text-base">{containerIcon()}</span>
                        <h3 class="flex-1 text-lg font-semibold text-gray-900 md:text-base">
                          {container.name}
                        </h3>

                        {/* Container Edit button */}
                        <button
                          class="text-sm text-gray-500"
                          onClick={() => props.onEditItem(container)}
                        >
                          <svg
                            class="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <Show
                          when={contents().length > 0}
                          fallback={<span class="text-xs text-gray-500">(empty)</span>}
                        >
                          <span
                            class={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              packedCount() === contents().length
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {packedCount()}/{contents().length}
                          </span>
                        </Show>
                        <Show when={containerBag()}>
                          <button
                            onClick={() => scrollToBag(containerBag()!.id)}
                            class="text-sm text-blue-600 hover:text-blue-800 hover:underline md:text-xs"
                            title="Scroll to bag"
                          >
                            in {containerBag()!.name}
                          </button>
                        </Show>
                        {/* Add items button */}
                        <div class="relative">
                          <button
                            onClick={() =>
                              setOpenContainerMenu(
                                openContainerMenu() === container.id ? null : container.id
                              )
                            }
                            class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
                            title="Add items to this container"
                          >
                            <svg
                              class="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                          <Show when={openContainerMenu() === container.id}>
                            <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                              <button
                                onClick={() => {
                                  props.onAddFromMasterToContainer?.(container.id);
                                  setOpenContainerMenu(null);
                                }}
                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                📋 From My Items
                              </button>
                              <button
                                onClick={() => {
                                  props.onBrowseTemplatesToContainer?.(container.id);
                                  setOpenContainerMenu(null);
                                }}
                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                📚 From Templates
                              </button>
                              <button
                                onClick={() => {
                                  props.onAddToContainer?.(container.id);
                                  setOpenContainerMenu(null);
                                }}
                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                ✏️ New Item
                              </button>
                            </div>
                          </Show>
                        </div>
                      </div>
                      <Show
                        when={contents().length > 0}
                        fallback={
                          <p class="text-sm text-gray-500">
                            No items yet. Drag items here or use the + button.
                          </p>
                        }
                      >
                        <div
                          class="grid gap-2 md:gap-1.5"
                          style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                        >
                          <For each={sortedContents()}>
                            {(item) => (
                              <DraggableItem item={item} enabled={isDragEnabled()}>
                                {(dragProps) => (
                                  <PackingItemCard
                                    item={item}
                                    selectMode={props.selectMode()}
                                    isSelected={props.selectedItems().has(item.id)}
                                    showCategoryInfo={true}
                                    onTogglePacked={() => props.onTogglePacked(item)}
                                    onEdit={() => props.onEditItem(item)}
                                    onToggleSelection={() => props.onToggleItemSelection(item.id)}
                                    dragActivators={dragProps.dragActivators}
                                    isDragging={dragProps.isDragging}
                                  />
                                )}
                              </DraggableItem>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </DroppableContainerSection>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      {/* Drag Overlay - shows preview of item being dragged */}
      <DragOverlay>
        <Show when={activeItem()}>
          <div class="rounded-lg border border-blue-300 bg-white p-3 shadow-xl ring-2 ring-blue-500">
            <p class="font-medium text-gray-900">{activeItem()!.name}</p>
            <Show when={activeItem()!.category_name}>
              <p class="text-sm text-gray-500">{activeItem()!.category_name}</p>
            </Show>
          </div>
        </Show>
      </DragOverlay>
    </DragDropProvider>
  );
}
