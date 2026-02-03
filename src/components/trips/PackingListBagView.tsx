/**
 * PackingListBagView Component
 *
 * Displays packing list grouped by bags, then by categories
 * Extracted from PackingPage for better separation of concerns
 * Now supports container items (sub-bags) with dedicated sections
 * Supports drag-and-drop to move items between bags and categories
 */

import {
  For,
  Show,
  type Accessor,
  createMemo,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
} from 'solid-js';
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
import { TripNotesButton } from './TripNotesButton';
import { TripNotesPanel } from './TripNotesPanel';
import { SwipeProvider, useSwipeContext } from './SwipeContext';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';
import { liveRectCollision, useAutoScroll, EscapeCancelHandler } from './drag-drop-utils';
import { CheckIcon, SwitchBagIcon } from '../ui/Icons';
import { ReplaceBagModal } from './ReplaceBagModal';

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

// Nav item type for unified visibility-ordered list
type NavItem =
  | { type: 'bag'; id: string | null; name: string; color: string | null }
  | { type: 'container'; id: string; name: string };

// Wayfinding nav bar component - needs to be inside DragDropProvider to access context
function WayfindingNavBar(props: {
  navItems: NavItem[];
  currentSection: () => string | null;
  activeItem: () => TripItem | null;
  onScrollToSection: (sectionId: string) => void;
  // Notes props
  hasNotes?: boolean;
  showNotesPanel?: () => boolean;
  onToggleNotesPanel?: () => void;
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
      <div class="flex items-center gap-x-1 gap-y-0">
        {/* Bags and containers interleaved in visibility order */}
        <div class="flex flex-1 flex-wrap gap-x-1 gap-y-0">
          <For each={props.navItems}>
            {(navItem) => {
              if (navItem.type === 'bag') {
                const sectionId = navItem.id ? `bag-section-${navItem.id}` : 'bag-section-none';
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
                    <Show when={navItem.id !== null} fallback={<span class="text-[10px]">👕</span>}>
                      <div
                        class={`h-2 w-2 rounded-full border border-gray-300 ${getBagColorClass(navItem.color)}`}
                        style={getBagColorStyle(navItem.color)}
                      />
                    </Show>
                    <span class="max-w-[130px] truncate">{navItem.name}</span>
                  </button>
                );
              } else {
                const sectionId = `container-section-${navItem.id}`;
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
                    <span class="max-w-[130px] truncate">{navItem.name}</span>
                  </button>
                );
              }
            }}
          </For>
        </div>

        {/* Trip Notes Button - at the far right */}
        <Show when={props.onToggleNotesPanel}>
          <TripNotesButton
            hasNotes={props.hasNotes || false}
            isOpen={props.showNotesPanel?.() || false}
            onClick={() => props.onToggleNotesPanel?.()}
          />
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
  tripId: string;
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
  // Add item callbacks for bags and containers
  onAddToBag?: (bagId: string | null) => void;
  onAddToContainer?: (containerId: string) => void;
  onAddFromMasterToBag?: (bagId: string | null) => void;
  onAddFromMasterToContainer?: (containerId: string) => void;
  onBrowseTemplatesToBag?: (bagId: string | null) => void;
  onBrowseTemplatesToContainer?: (containerId: string) => void;
  // Drag-and-drop handlers
  onMoveItemToBag?: (itemId: string, bagId: string | null) => void;
  onMoveItemToContainer?: (itemId: string, containerId: string) => void;
  // Quantity update
  onUpdateQuantity?: (item: TripItem, quantity: number) => void;
  // Replace bag callback
  onBagReplaced?: () => void;
  // Trip notes props
  tripNotes?: string;
  showNotesPanel?: Accessor<boolean>;
  onToggleNotesPanel?: () => void;
  onNotesChange?: (notes: string) => void;
}

// Inner component that uses swipe context
function PackingListBagViewInner(props: PackingListBagViewProps) {
  const [openBagMenu, setOpenBagMenu] = createSignal<string | null>(null);
  const [openContainerMenu, setOpenContainerMenu] = createSignal<string | null>(null);
  const [activeItem, setActiveItem] = createSignal<TripItem | null>(null);
  const [replacingBagId, setReplacingBagId] = createSignal<string | null>(null);
  const autoScroll = useAutoScroll();
  const swipeContext = useSwipeContext();

  // Close revealed item when drag starts
  const closeSwipeOnDrag = () => swipeContext.closeAll();

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
    closeSwipeOnDrag(); // Close any revealed swipe actions when starting drag
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

  // Scroll to a container's card in its bag
  const scrollToContainerCard = (containerId: string) => {
    const element = document.getElementById(`trip-item-${containerId}`);
    const scrollContainer = document.querySelector('main.overflow-y-auto');
    if (element && scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top + scrollContainer.scrollTop - 28;
      scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  // Get bag name by ID
  const getBagName = (bagId: string | null) => {
    if (!bagId) return 'Wearing / No Bag';
    const bag = props.bags()?.find((b) => b.id === bagId);
    return bag?.name || 'Unknown Bag';
  };

  const itemsByBag = createMemo(() => {
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
  });

  const categoryLookup = createMemo(() => {
    const categories = props.categories() || [];
    return new Map(categories.map((c) => [c.name, c]));
  });

  // Get category icon by name - using lookup map for O(1) access
  const getCategoryIcon = (categoryName: string) => {
    return categoryLookup().get(categoryName)?.icon || '📦';
  };

  // Sort bags alphabetically
  const sortedBags = createMemo(() => {
    return [...itemsByBag().allBags].sort((a, b) => a.name.localeCompare(b.name));
  });

  const containersByBag = createMemo(() => {
    const map = new Map<string | null, TripItem[]>();
    containerData().containers.forEach((container) => {
      const key = container.bag_id || null;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(container);
    });
    return map;
  });

  // Build nav items in visibility order: for each bag, followed by its containers
  const navItems = createMemo((): NavItem[] => {
    const items: NavItem[] = [];
    const cByBag = containersByBag();
    for (const bag of sortedBags()) {
      items.push({ type: 'bag', id: bag.id, name: bag.name, color: bag.color });
      const containers = cByBag.get(bag.id) || [];
      for (const c of [...containers].sort((a, b) => a.name.localeCompare(b.name))) {
        items.push({ type: 'container', id: c.id, name: c.name });
      }
    }
    return items;
  });

  // Track current visible section for wayfinding nav bar
  const [currentSection, setCurrentSection] = createSignal<string | null>(null);

  // Set up Intersection Observer to track which section is visible (created once)
  const visibleSections = new Set<string>();
  let observer: IntersectionObserver | null = null;

  const updateCurrentSection = () => {
    const allSections = document.querySelectorAll(
      '[id^="bag-section-"], [id^="container-section-"]'
    );
    for (const section of allSections) {
      if (visibleSections.has(section.id)) {
        setCurrentSection(section.id);
        return;
      }
    }
  };

  // Create observer once on mount
  onMount(() => {
    const scrollContainer = document.querySelector('main.overflow-y-auto') as HTMLElement | null;

    observer = new IntersectionObserver(
      (entries) => {
        // Update the set of visible sections
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }
        updateCurrentSection();
      },
      {
        root: scrollContainer,
        rootMargin: '-28px 0px 0px 0px',
        threshold: 0,
      }
    );

    onCleanup(() => {
      if (observer) {
        observer.disconnect();
      }
    });
  });

  // Update observed elements when bags/containers change
  createEffect(() => {
    const bags = props.bags();
    const containers = containerData().containers;

    // Wait for bags to be loaded and observer to be created
    if (!bags || bags.length === 0 || !observer) return;

    // Wait for layout to settle before observing
    requestAnimationFrame(() => {
      setTimeout(() => {
        const bagSections = document.querySelectorAll('[id^="bag-section-"]');
        const containerSections = document.querySelectorAll('[id^="container-section-"]');

        // Set initial section to first bag if available
        if (bagSections.length > 0 && !currentSection()) {
          setCurrentSection(bagSections[0].id);
        }

        // Start observing (note: observing same element multiple times is safe, it's a no-op)
        bagSections.forEach((el) => observer!.observe(el));
        containerSections.forEach((el) => observer!.observe(el));

        // Trigger immediate check
        setTimeout(updateCurrentSection, 50);
      }, 150);
    });
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
        <Show when={navItems().length > 1}>
          <WayfindingNavBar
            navItems={navItems()}
            currentSection={currentSection}
            activeItem={activeItem}
            onScrollToSection={scrollToSection}
            hasNotes={Boolean(props.tripNotes?.trim())}
            showNotesPanel={props.showNotesPanel}
            onToggleNotesPanel={props.onToggleNotesPanel}
          />
        </Show>

        {/* Trip Notes Panel - expands below nav bar */}
        <Show when={props.showNotesPanel?.() && props.onNotesChange}>
          <TripNotesPanel
            notes={props.tripNotes || ''}
            onNotesChange={props.onNotesChange!}
            onClose={() => props.onToggleNotesPanel?.()}
          />
        </Show>

        {/* Bag Sections */}
        <For each={sortedBags()}>
          {(bag) => {
            const bagCategories = () => itemsByBag().grouped.get(bag.id) || new Map();
            const allBagItems = () => Array.from(bagCategories().values()).flat();
            const totalItems = () => allBagItems().length;
            const packedItems = () => allBagItems().filter((item) => item.is_packed).length;
            // Sort categories alphabetically within bag and pre-sort items within each category
            const sortedCategories = () => {
              return Array.from(bagCategories().entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(
                  ([category, items]) =>
                    [category, [...items].sort((a, b) => a.name.localeCompare(b.name))] as [
                      string,
                      TripItem[],
                    ]
                );
            };
            const bagContainers = () => {
              const containers = containersByBag().get(bag.id) || [];
              return [...containers].sort((a, b) => a.name.localeCompare(b.name));
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
                    {/* Replace bag button - only for real bags */}
                    <Show when={bag.id !== null}>
                      <button
                        onClick={() => setReplacingBagId(bag.id as string)}
                        class="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        title="Replace this bag"
                      >
                        <SwitchBagIcon class="h-4 w-4" />
                      </button>
                      <Show when={replacingBagId() === bag.id}>
                        <ReplaceBagModal
                          tripId={props.tripId}
                          currentBag={bag}
                          tripBags={props.bags()}
                          onClose={() => setReplacingBagId(null)}
                          onReplaced={() => props.onBagReplaced?.()}
                        />
                      </Show>
                    </Show>
                    {/* Add items button - all bags including Wearing/No Bag */}
                    {(() => {
                      const menuKey = bag.id ?? '__wearing__';
                      return (
                        <div class="relative">
                          <button
                            onClick={() =>
                              setOpenBagMenu(openBagMenu() === menuKey ? null : menuKey)
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
                          <Show when={openBagMenu() === menuKey}>
                            <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                              <button
                                onClick={() => {
                                  props.onAddToBag?.(bag.id);
                                  setOpenBagMenu(null);
                                }}
                                class="w-full px-4 py-2 text-left text-sm font-bold hover:bg-gray-100"
                              >
                                ✏️ New Item
                              </button>
                              <button
                                onClick={() => {
                                  props.onAddFromMasterToBag?.(bag.id);
                                  setOpenBagMenu(null);
                                }}
                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                📋 From My Saved Items
                              </button>
                              <button
                                onClick={() => {
                                  props.onBrowseTemplatesToBag?.(bag.id);
                                  setOpenBagMenu(null);
                                }}
                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                📚 From Templates
                              </button>
                            </div>
                          </Show>
                        </div>
                      );
                    })()}
                  </div>
                  {/* Show "All packed" summary if filtering and everything is packed */}
                  <Show
                    when={
                      props.showUnpackedOnly?.() &&
                      packedItems() === totalItems() &&
                      totalItems() > 0
                    }
                  >
                    <div class="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                      <CheckIcon class="h-4 w-4" />
                      All {totalItems()} items packed
                    </div>
                  </Show>
                  {/* Show categories with items (filtered if showUnpackedOnly) */}
                  <Show when={!props.showUnpackedOnly?.() || packedItems() < totalItems()}>
                    <For each={sortedCategories()}>
                      {([category, categoryItems]) => {
                        const unpackedItems = () =>
                          categoryItems.filter((item) => !item.is_packed && !item.is_skipped);
                        const packedCount = () =>
                          categoryItems.filter((item) => item.is_packed).length;
                        const itemsToShow = () =>
                          props.showUnpackedOnly?.() ? unpackedItems() : categoryItems;
                        const allCategoryPacked = () =>
                          props.showUnpackedOnly?.() &&
                          itemsToShow().length === 0 &&
                          packedCount() > 0;
                        // Skip category if filtering and no items at all
                        return (
                          <Show
                            when={
                              itemsToShow().length > 0 ||
                              (props.showUnpackedOnly?.() && packedCount() > 0)
                            }
                          >
                            <div class="mb-4 md:mb-2">
                              <h3 class="mb-2 flex items-center gap-1 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs">
                                <span class="text-base md:text-sm">
                                  {getCategoryIcon(category)}
                                </span>
                                {category}
                                {/* Inline packed count when all items in category are packed */}
                                <Show when={allCategoryPacked()}>
                                  <span class="ml-1 flex items-center gap-1 text-gray-400">
                                    ·
                                    <CheckIcon class="h-3 w-3 text-green-600" />
                                    <span class="text-gray-500">{packedCount()} packed</span>
                                  </span>
                                </Show>
                              </h3>
                              <Show when={!allCategoryPacked()}>
                                <div
                                  class="grid gap-2 md:gap-1.5"
                                  style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                                >
                                  <For each={itemsToShow()}>
                                    {(item) => {
                                      const canDrag = () => isDragEnabled();
                                      return (
                                        <DraggableItem item={item} enabled={canDrag()}>
                                          {(dragProps) => (
                                            <PackingItemCard
                                              item={item}
                                              selectMode={props.selectMode()}
                                              isSelected={props.selectedItems().has(item.id)}
                                              categoryIcon={
                                                item.is_container && item.category_name
                                                  ? getCategoryIcon(item.category_name)
                                                  : undefined
                                              }
                                              onTogglePacked={() => props.onTogglePacked(item)}
                                              onToggleSkipped={() => props.onToggleSkipped(item)}
                                              onEdit={() => props.onEditItem(item)}
                                              onToggleSelection={() =>
                                                props.onToggleItemSelection(item.id)
                                              }
                                              onUpdateQuantity={
                                                props.onUpdateQuantity
                                                  ? (qty) => props.onUpdateQuantity!(item, qty)
                                                  : undefined
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
                            </div>
                          </Show>
                        );
                      }}
                    </For>
                  </Show>
                  <Show when={bagContainers().length > 0}>
                    <div class="mt-4 space-y-4 border-l-2 border-blue-100 pl-4 md:mt-2 md:space-y-2 md:pl-3">
                      <For each={bagContainers()}>
                        {(container) => {
                          const contents = () => getContainerContents(container.id);
                          const packedCount = () =>
                            contents().filter((item) => item.is_packed).length;
                          const sortedContents = () =>
                            [...contents()].sort((a, b) => a.name.localeCompare(b.name));
                          const containerIcon = () =>
                            container.category_name
                              ? getCategoryIcon(container.category_name)
                              : '📦';
                          return (
                            <DroppableContainerSection containerId={container.id}>
                              <div
                                id={`container-section-${container.id}`}
                                class="rounded-lg border border-blue-100 bg-blue-50/40 p-3 shadow-sm md:p-2"
                              >
                                <div class="mb-2 flex items-center gap-2">
                                  <span class="text-base md:text-sm">{containerIcon()}</span>
                                  <h3 class="flex-1 font-semibold text-gray-800">
                                    {container.name}
                                    <button
                                      onClick={() => scrollToContainerCard(container.id)}
                                      class="ml-2 text-xs font-normal text-blue-600 hover:underline"
                                    >
                                      view in {getBagName(container.bag_id)} ↑
                                    </button>
                                  </h3>
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
                                  {/* Edit container button */}
                                  <button
                                    onClick={() => props.onEditItem(container)}
                                    class="p-1.5 text-gray-400 transition-colors hover:text-blue-600"
                                    title="Edit container"
                                    aria-label="Edit container"
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
                                  {/* Add items button */}
                                  <div class="relative">
                                    <button
                                      onClick={() =>
                                        setOpenContainerMenu(
                                          openContainerMenu() === container.id ? null : container.id
                                        )
                                      }
                                      class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
                                      title="Add items to this container"
                                    >
                                      <svg
                                        class="h-3.5 w-3.5"
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
                                            props.onAddToContainer?.(container.id);
                                            setOpenContainerMenu(null);
                                          }}
                                          class="w-full px-4 py-2 text-left text-sm font-bold hover:bg-gray-100"
                                        >
                                          ✏️ New Item
                                        </button>
                                        <button
                                          onClick={() => {
                                            props.onAddFromMasterToContainer?.(container.id);
                                            setOpenContainerMenu(null);
                                          }}
                                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                                        >
                                          📋 From My Saved Items
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
                                  {(() => {
                                    const unpackedContents = () =>
                                      sortedContents().filter(
                                        (item) => !item.is_packed && !item.is_skipped
                                      );
                                    const packedContentsCount = () =>
                                      sortedContents().filter((item) => item.is_packed).length;
                                    const contentsToShow = () =>
                                      props.showUnpackedOnly?.()
                                        ? unpackedContents()
                                        : sortedContents();
                                    return (
                                      <>
                                        {/* All packed summary for container */}
                                        <Show
                                          when={
                                            props.showUnpackedOnly?.() &&
                                            packedCount() === contents().length
                                          }
                                        >
                                          <div class="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                                            <CheckIcon class="h-4 w-4" />
                                            All {contents().length} items packed
                                          </div>
                                        </Show>
                                        {/* Items grid (filtered if showUnpackedOnly) */}
                                        <Show when={contentsToShow().length > 0}>
                                          <div
                                            class="grid gap-2 md:gap-1.5"
                                            style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                                          >
                                            <For each={contentsToShow()}>
                                              {(item) => (
                                                <DraggableItem
                                                  item={item}
                                                  enabled={isDragEnabled()}
                                                >
                                                  {(dragProps) => (
                                                    <PackingItemCard
                                                      item={item}
                                                      selectMode={props.selectMode()}
                                                      isSelected={props
                                                        .selectedItems()
                                                        .has(item.id)}
                                                      onTogglePacked={() =>
                                                        props.onTogglePacked(item)
                                                      }
                                                      onToggleSkipped={() =>
                                                        props.onToggleSkipped(item)
                                                      }
                                                      onEdit={() => props.onEditItem(item)}
                                                      onToggleSelection={() =>
                                                        props.onToggleItemSelection(item.id)
                                                      }
                                                      onUpdateQuantity={
                                                        props.onUpdateQuantity
                                                          ? (qty) =>
                                                              props.onUpdateQuantity!(item, qty)
                                                          : undefined
                                                      }
                                                      dragActivators={dragProps.dragActivators}
                                                      isDragging={dragProps.isDragging}
                                                      revealedItemId={swipeContext.revealedItemId}
                                                      onRevealChange={
                                                        swipeContext.setRevealedItemId
                                                      }
                                                    />
                                                  )}
                                                </DraggableItem>
                                              )}
                                            </For>
                                            {/* Collapsed packed items row for container */}
                                            <Show
                                              when={
                                                props.showUnpackedOnly?.() &&
                                                packedContentsCount() > 0 &&
                                                unpackedContents().length > 0
                                              }
                                            >
                                              <div class="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
                                                <CheckIcon class="h-4 w-4 text-green-600" />
                                                {packedContentsCount()} packed
                                              </div>
                                            </Show>
                                          </div>
                                        </Show>
                                      </>
                                    );
                                  })()}
                                </Show>
                              </div>
                            </DroppableContainerSection>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              </DroppableBagSection>
            );
          }}
        </For>
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

// Export wrapper that provides swipe context
export function PackingListBagView(props: PackingListBagViewProps) {
  return (
    <SwipeProvider>
      <PackingListBagViewInner {...props} />
    </SwipeProvider>
  );
}
