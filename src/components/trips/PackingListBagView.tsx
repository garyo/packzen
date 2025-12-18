/**
 * PackingListBagView Component
 *
 * Displays packing list grouped by bags, then by categories
 * Extracted from PackingPage for better separation of concerns
 * Now supports container items (sub-bags) with dedicated sections
 */

import { For, Show, type Accessor, createMemo, createSignal } from 'solid-js';
import type { TripItem, Bag, Category } from '../../lib/types';
import { PackingItemCard } from './PackingItemCard';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';

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
}

export function PackingListBagView(props: PackingListBagViewProps) {
  const [openBagMenu, setOpenBagMenu] = createSignal<string | null>(null);
  const [openContainerMenu, setOpenContainerMenu] = createSignal<string | null>(null);

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

  return (
    <div class="space-y-6 md:space-y-3">
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
          return (
            <Show when={totalItems() > 0}>
              <div id={bag.id ? `bag-section-${bag.id}` : undefined}>
                <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                  <Show
                    when={bag.id !== null}
                    fallback={<span class="text-lg md:text-base">👕</span>}
                  >
                    <div
                      class={`h-3 w-3 rounded-full md:h-2.5 md:w-2.5 ${getBagColorClass(bag.color)}`}
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
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                              props.onAddFromMasterToBag?.(bag.id as string);
                              setOpenBagMenu(null);
                            }}
                            class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                          >
                            📋 From All Items
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
                          <button
                            onClick={() => {
                              props.onAddToBag?.(bag.id as string);
                              setOpenBagMenu(null);
                            }}
                            class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                          >
                            ✏️ New Item
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
                    const categoryIcon = getCategoryIcon(category);
                    return (
                      <div class="mb-4 md:mb-2">
                        <h3 class="mb-2 flex items-center gap-1 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs">
                          <span class="text-base md:text-sm">{categoryIcon}</span>
                          {category}
                        </h3>
                        <div
                          class="grid gap-2 md:gap-1.5"
                          style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                        >
                          <For each={sortedItems}>
                            {(item) => (
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
                                onToggleSelection={() => props.onToggleItemSelection(item.id)}
                                containerContentsCount={
                                  item.is_container
                                    ? getContainerContents(item.id).length
                                    : undefined
                                }
                                containerPackedCount={
                                  item.is_container ? getContainerPackedCount(item.id) : undefined
                                }
                                onContainerClick={
                                  item.is_container && getContainerContents(item.id).length > 0
                                    ? () => scrollToContainer(item.id)
                                    : undefined
                                }
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
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

              return (
                <div
                  id={`container-section-${container.id}`}
                  class="mb-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 md:mb-3 md:p-2"
                >
                  <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                    <span class="text-lg md:text-base">{containerIcon()}</span>
                    <h3 class="flex-1 text-lg font-semibold text-gray-900 md:text-base">
                      {container.name}
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
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                            📋 From All Items
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
                        No items yet. Add items and assign them to this container.
                      </p>
                    }
                  >
                    <div
                      class="grid gap-2 md:gap-1.5"
                      style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                    >
                      <For each={sortedContents()}>
                        {(item) => (
                          <PackingItemCard
                            item={item}
                            selectMode={props.selectMode()}
                            isSelected={props.selectedItems().has(item.id)}
                            showCategoryInfo={true}
                            onTogglePacked={() => props.onTogglePacked(item)}
                            onEdit={() => props.onEditItem(item)}
                            onToggleSelection={() => props.onToggleItemSelection(item.id)}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
